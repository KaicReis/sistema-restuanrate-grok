import { insumoArquivado } from "./insumos";
import { validarNota } from "./purchase-validation";
import { preservarUnidadesDeFicha } from "./dna";
import { insumosMes } from "./v2";
import { z } from "zod";
import type { Database, Unidade } from "./types";
import Decimal from "decimal.js";
import { numeroBR } from "./purchase-numbers";
const numero = z.preprocess((v) => {
  try {
    return numeroBR(v);
  } catch {
    return v;
  }
}, z.number().nonnegative().max(1e10));
const unidadeSchema = z.enum(["kg", "g", "L", "ml", "un"]);
export const linhaSchema = z.object({
  nome: z.string().min(1).max(500),
  quantidade: numero.refine((v) => v > 0 && v <= 1e9),
  unidade: unidadeSchema,
  valorUnitario: numero,
  total: numero,
  codigo: z.string().max(500).optional(),
  unidadeComercial: z.string().max(30).optional(),
  conteudo: numero.refine((v) => v > 0).optional(),
  conversaoPendente: z.boolean().optional(),
  descontoItem: numero.optional(),
  originais: z.record(z.string(), z.string().nullable()).optional(),
  insumo_id: z.string().optional(),
  ignorar: z.boolean().optional(),
});
export const compraSchema = z.object({
  id: z.string().min(1),
  restaurante_id: z.string().min(1),
  fornecedor: z.string().min(1).max(500),
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (v) =>
        !Number.isNaN(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v,
      "Data inválida",
    ),
  desconto: numero.optional(),
  frete: numero.optional(),
  outrasDespesas: numero.optional(),
  totalProdutos: numero.optional(),
  totalNota: numero.optional(),
  chave: z.string().max(60).optional(),
  emitente: z.string().max(30).optional(),
  originais: z.record(z.string(), z.string().nullable()).optional(),
  itens: z.array(linhaSchema).min(1).max(300),
});
// Extração e revisão usam reais; somente a confirmação converte em centavos.
export type Compra = z.infer<typeof compraSchema>;
export function sugerirInsumo(db: Database, operacao: string, nome: string) {
  const normal = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .trim();
  const n = normal(nome);
  const ativos = db.insumos.filter(
    (i) => i.restaurante_id === operacao && !insumoArquivado(i),
  );
  return (
    ativos.find((i) => normal(i.nome) === n)?.id ??
    ativos.find((i) => {
      const nomeAtivo = normal(i.nome);
      return n.length > 3 && nomeAtivo.length > 0 &&
        (` ${nomeAtivo} `.includes(` ${n} `) || ` ${n} `.includes(` ${nomeAtivo} `));
    })?.id
  );
}
export function confirmarCompra(db: Database, input: Compra, conferido = false) {
  const compra = compraSchema.parse(input);
  if (
    !db.restaurantes.some(
      (r) => r.id === compra.restaurante_id && !r.grupo && r.id !== "a-vila",
    )
  )
    throw new Error("Operação inválida");
  if (db.compras?.some((c) => c.id === compra.id))
    throw new Error("Compra já confirmada");
  if (compra.itens.every((i) => i.ignorar))
    throw new Error("Selecione pelo menos um item");
  if (!conferido && !validarNota(compra).valido)
    throw new Error("Confira as divergências aritméticas das linhas da nota");
  // Validate every row before mutating the database (confirmation is atomic).
  for (const linha of compra.itens) {
    if (linha.ignorar) continue;
    if (linha.conversaoPendente)
      throw new Error("Revise o conteúdo da embalagem: " + linha.nome);
    if (
      linha.insumo_id &&
      !db.insumos.some(
        (i) =>
          i.id === linha.insumo_id &&
          i.restaurante_id === compra.restaurante_id &&
          !insumoArquivado(i),
      )
    )
      throw new Error("Insumo de outra operação, arquivado ou inexistente");
  }
  const mes = compra.data.slice(0, 7);
  const insumosNoMes = new Map(insumosMes(db, mes).map((i) => [i.id, i]));
  for (const linha of compra.itens) {
    if (linha.ignorar) continue;
    const custo = snapshotCusto(linha);
    let insumo = db.insumos.find(
      (i) =>
        i.id === linha.insumo_id && i.restaurante_id === compra.restaurante_id,
    );
    if (linha.insumo_id && !insumo)
      throw new Error("Insumo de outra operação, arquivado ou inexistente");
    if (!insumo) {
      insumo = {
        id: crypto.randomUUID(),
        restaurante_id: compra.restaurante_id,
        nome: linha.nome,
        unidade: linha.unidade as Unidade,
        quantidade: custo.quantidade,
        preco: custo.preco,
        rendimento: 100,
        historicoPrecos: {},
      };
      db.insumos.push(insumo);
      linha.insumo_id = insumo.id;
    }
    const anterior = insumosNoMes.get(insumo.id);
    if (anterior) preservarUnidadesDeFicha(db, anterior, linha.unidade);
    // O preço vem exclusivamente de vUnCom; totais e despesas são informativos.
    const h = {
      preco: custo.preco,
      quantidade: custo.quantidade,
      unidade: linha.unidade,
      rendimento: insumo.rendimento,
      precoPendente: false,
    };
    if (linha.unidadeComercial) {
      const key = chaveConversao(compra, linha);
      for (const outro of db.insumos.filter(
        (i) =>
          i.restaurante_id === compra.restaurante_id && i.id !== insumo!.id,
      ))
        if (outro.conversoes)
          outro.conversoes = outro.conversoes.filter((c) => c.chave !== key);
      insumo.conversoes ??= [];
      insumo.conversoes = insumo.conversoes.filter((c) => c.chave !== key);
      insumo.conversoes.push({
        chave: key,
        conteudo: linha.conteudo ?? 1,
        unidade: linha.unidade,
      });
    }
    insumo.historicoPrecos ??= {
      "0000-01": {
        preco: insumo.preco,
        quantidade: insumo.quantidade,
        unidadesNaCompra: insumo.unidadesNaCompra,
        unidade: insumo.unidade,
        rendimento: insumo.rendimento,
        precoPendente: insumo.precoPendente,
      },
    };
    insumo.historicoPrecos[mes] = h;
    const latest = Object.keys(insumo.historicoPrecos).sort().at(-1);
    if (latest === mes) {
      Object.assign(insumo, h);
      delete insumo.unidadesNaCompra;
    }
  }
  db.compras ??= [];
  db.compras.push(compra);
}

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
export function chaveConversao(
  nota: Pick<Compra, "fornecedor" | "emitente">,
  linha: Pick<Compra["itens"][number], "codigo" | "nome">,
) {
  return JSON.stringify([
    nota.emitente?.replace(/\D/g, "") || normalizar(nota.fornecedor),
    linha.codigo ? "codigo" : "descricao",
    normalizar(linha.codigo || linha.nome),
  ]);
}
export function extrairEmbalagem(
  descricao: string,
  comercial: string,
): { conteudo: number; unidade: Unidade; conversaoPendente: boolean } {
  const s = normalizar(descricao);
  const comercialNormal = comercial.trim().toUpperCase();
  if (["KG", "G", "L", "ML"].includes(comercialNormal))
    return {
      conteudo: 1,
      unidade: (
        { KG: "kg", G: "g", L: "L", ML: "ml" } as Record<string, Unidade>
      )[comercialNormal],
      conversaoPendente: false,
    };
  // Prefer weight/volume over counts such as 160 FATIAS or 192F.
  const multi = s.match(
    /(\d+)\s*(?:X|\/)\s*(\d+(?:[,.]\d+)?)\s*(KG|G|ML|L|UN)\b/,
  );
  const simples =
    s.match(/(\d+(?:[,.]\d+)?)\s*(KG|G|ML|L)\b/) || s.match(/(\d+)\s*(UN)\b/);
  const m = multi || simples;
  if (m) {
    const valor = multi
      ? Number(m[1]) * Number(m[2].replace(",", "."))
      : Number(m[1].replace(",", "."));
    const u = (multi ? m[3] : m[2]).toUpperCase();
    return {
      conteudo: valor / (u === "G" || u === "ML" ? 1000 : 1),
      unidade:
        u === "G" || u === "KG" ? "kg" : u === "L" || u === "ML" ? "L" : "un",
      conversaoPendente: false,
    };
  }
  const u = comercial.toUpperCase();
  if (["KG", "G", "L", "ML", "UN"].includes(u))
    return {
      conteudo: 1,
      unidade: (
        { KG: "kg", G: "g", L: "L", ML: "ml", UN: "un" } as Record<
          string,
          Unidade
        >
      )[u],
      conversaoPendente: false,
    };
  return { conteudo: 1, unidade: "un", conversaoPendente: true };
}
export function converterConteudo(
  conteudo: number,
  de: Unidade,
  para: Unidade,
): number {
  const base = {
    kg: ["massa", 1000],
    g: ["massa", 1],
    L: ["volume", 1000],
    ml: ["volume", 1],
    un: ["contagem", 1],
  } as const;
  if (base[de][0] !== base[para][0])
    throw new Error("Unidades incompatíveis; revise o conteúdo por embalagem");
  return (conteudo * base[de][1]) / base[para][1];
}
export function prepararLinha(
  db: Database,
  operacao: string,
  nota: Pick<Compra, "fornecedor" | "emitente">,
  linha: Compra["itens"][number],
) {
  const chave = chaveConversao(nota, linha);
  const insumo = db.insumos.find(
    (i) =>
      i.restaurante_id === operacao &&
      !insumoArquivado(i) &&
      i.conversoes?.some((c) => c.chave === chave),
  );
  const salvo = insumo?.conversoes?.find((c) => c.chave === chave);
  if (salvo) {
    try {
      return {
        ...linha,
        conteudo: converterConteudo(
          salvo.conteudo,
          salvo.unidade,
          insumo!.unidade,
        ),
        unidade: insumo!.unidade,
        insumo_id: insumo!.id,
        conversaoPendente: false,
      };
    } catch {
      return {
        ...linha,
        conteudo: salvo.conteudo,
        unidade: insumo!.unidade,
        insumo_id: insumo!.id,
        conversaoPendente: true,
      };
    }
  }
  const embalagem = extrairEmbalagem(
    linha.nome,
    linha.unidadeComercial || linha.unidade,
  );
  const id = sugerirInsumo(db, operacao, linha.nome);
  const destino = db.insumos.find((i) => i.id === id);
  if (destino) {
    try {
      return {
        ...linha,
        ...embalagem,
        conteudo: converterConteudo(
          embalagem.conteudo,
          embalagem.unidade,
          destino.unidade,
        ),
        unidade: destino.unidade,
        insumo_id: id,
      };
    } catch {
      return {
        ...linha,
        ...embalagem,
        unidade: destino.unidade,
        insumo_id: id,
        conversaoPendente: true,
      };
    }
  }
  return { ...linha, ...embalagem, insumo_id: id };
}
/** Normalizes fractional cents without rounding the commercial unit price. */
function snapshotCusto(linha: Compra["itens"][number]) {
  const centavos = new Decimal(linha.valorUnitario).times(linha.quantidade).times(100);
  const escala = new Decimal(10).pow(centavos.decimalPlaces());
  return {
    preco: centavos.times(escala).toNumber(),
    quantidade: new Decimal(linha.quantidade).times(linha.conteudo ?? 1).times(escala).toNumber(),
  };
}

/** Fiscal amounts are informational and never determine ingredient prices. */
export function resumoCompra(compra: Compra) {
  const soma = compra.itens.reduce((s, i) => s.plus(i.total), new Decimal(0));
  const desconto = compra.desconto ?? compra.itens.reduce((s, i) => s + (i.descontoItem ?? 0), 0);
  const calculado = soma.minus(desconto).plus(compra.frete ?? 0).plus(compra.outrasDespesas ?? 0);
  return { total: compra.totalNota ?? calculado.toNumber(), calculado: calculado.toNumber() };
}

export function custoUnitario(linha: Compra["itens"][number]) {
  return new Decimal(linha.valorUnitario).div(linha.conteudo ?? 1).toNumber();
}

/** Editing the unit cost changes only this row's commercial price and gross total. */
export function totalPorCusto(compra: Compra, index: number, custo: number) {
  if (!Number.isFinite(custo) || custo < 0) throw new Error("Custo inválido");
  const linha = compra.itens[index];
  return new Decimal(custo).times(linha.conteudo ?? 1).times(linha.quantidade).toDecimalPlaces(2).toNumber();
}
