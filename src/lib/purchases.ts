import { validarNota } from "./purchase-validation";
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
  return (
    db.insumos
      .filter((i) => i.restaurante_id === operacao)
      .find((i) => normal(i.nome) === n)?.id ??
    db.insumos
      .filter((i) => i.restaurante_id === operacao)
      .find(
        (i) =>
          n.length > 3 &&
          (normal(i.nome).includes(n) || n.includes(normal(i.nome))),
      )?.id
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
  const custos = ratearCompra(compra);
  if (!conferido && !validarNota({ ...compra, totalProdutos: compra.totalProdutos ?? compra.itens.reduce((s, i) => s + i.total, 0), totalNota: compra.totalNota ?? custos.total }).valido) throw new Error("Confira as divergências aritméticas da nota");
  if (custos.divergencia && !conferido) throw new Error(custos.divergencia);
  // Validate every row before mutating the database (confirmation is atomic).
  for (const linha of compra.itens) {
    if (linha.ignorar) continue;
    if (linha.conversaoPendente)
      throw new Error("Revise o conteúdo da embalagem: " + linha.nome);
    if (!conferido && Math.abs(linha.total - linha.quantidade * linha.valorUnitario) > 0.05)
      throw new Error(
        "Total diverge de quantidade × valor unitário: " + linha.nome,
      );
    if (
      linha.insumo_id &&
      !db.insumos.some(
        (i) =>
          i.id === linha.insumo_id &&
          i.restaurante_id === compra.restaurante_id,
      )
    )
      throw new Error("Insumo de outra operação ou inexistente");
  }
  const mes = compra.data.slice(0, 7);
  for (const [index, linha] of compra.itens.entries()) {
    if (linha.ignorar) continue;
    let insumo = db.insumos.find(
      (i) =>
        i.id === linha.insumo_id && i.restaurante_id === compra.restaurante_id,
    );
    if (linha.insumo_id && !insumo)
      throw new Error("Insumo de outra operação ou inexistente");
    if (!insumo) {
      insumo = {
        id: crypto.randomUUID(),
        restaurante_id: compra.restaurante_id,
        nome: linha.nome,
        unidade: linha.unidade as Unidade,
        quantidade: linha.quantidade * (linha.conteudo ?? 1),
        preco: custos.centavos[index],
        rendimento: 100,
        historicoPrecos: {},
      };
      db.insumos.push(insumo);
      linha.insumo_id = insumo.id;
    }
    // Snapshot da embalagem comprada, com quantidade e unidade revisadas: mantém conversão do custo por unidade.
    const h = {
      preco: custos.centavos[index],
      quantidade: linha.quantidade * (linha.conteudo ?? 1),
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
        unidade: insumo.unidade,
        rendimento: insumo.rendimento,
        precoPendente: insumo.precoPendente,
      },
    };
    insumo.historicoPrecos[mes] = h;
    const latest = Object.keys(insumo.historicoPrecos).sort().at(-1);
    if (latest === mes) Object.assign(insumo, h);
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
export function ratearCompra(compra: Compra) {
  const soma = compra.itens.reduce((s, i) => s.plus(i.total), new Decimal(0));
  const desconto = new Decimal(
    compra.desconto ??
      compra.itens.reduce((s, i) => s + (i.descontoItem ?? 0), 0),
  );
  const acrescimos = new Decimal(compra.frete ?? 0).plus(
    compra.outrasDespesas ?? 0,
  );
  const liquido = soma.minus(desconto).plus(acrescimos);
  if (![soma, desconto, acrescimos, liquido].every((n) => n.isFinite()))
    throw new Error("Revise os números da nota");
  let divergencia = "";
  if (soma.isZero() && !liquido.isZero())
    divergencia = "Não é possível ratear despesas sem valor de produtos";
  if (desconto.gt(soma))
    divergencia = "Desconto maior que o total dos produtos";
  if (
    compra.totalProdutos !== undefined &&
    soma.minus(compra.totalProdutos).abs().gt("0.01")
  )
    divergencia = "Soma dos itens diverge do total de produtos";
  if (
    compra.totalNota !== undefined &&
    liquido.minus(compra.totalNota).abs().gt("0.01")
  )
    divergencia =
      "Soma dos itens − desconto + frete/outras despesas diverge do total da nota";
  const alvo = liquido.times(100).toDecimalPlaces(0).toNumber();
  // Cumulative rounding conserves cents, including when some rows are ignored.
  let acumulado = new Decimal(0),
    anterior = 0;
  const centavos = compra.itens.map((i) => {
    acumulado = acumulado.plus(
      soma.isZero() ? 0 : new Decimal(i.total).div(soma).times(alvo),
    );
    const arredondado = acumulado.toDecimalPlaces(0).toNumber();
    const valor = arredondado - anterior;
    anterior = arredondado;
    return valor;
  });
  return { centavos, total: liquido.toNumber(), divergencia };
}

/** Editing the resulting unit cost changes the gross row, retaining proportional allocation. */
export function totalPorCusto(compra: Compra, index: number, custo: number) {
  const linha = compra.itens[index];
  const liquido = custo * linha.quantidade * (linha.conteudo ?? 1);
  const outros = compra.itens.reduce(
    (s, i, n) => s + (n === index ? 0 : i.total),
    0,
  );
  const ajuste =
    (compra.frete ?? 0) +
    (compra.outrasDespesas ?? 0) -
    (compra.desconto ??
      compra.itens.reduce((s, i) => s + (i.descontoItem ?? 0), 0));
  if (!Number.isFinite(liquido) || liquido < 0)
    throw new Error("Custo inválido");
  let bruto: number;
  if (outros === 0) bruto = liquido - ajuste;
  else {
    const b = outros + ajuste - liquido;
    const raiz = Math.sqrt(b * b + 4 * liquido * outros);
    bruto =
      b >= 0
        ? liquido === 0
          ? 0
          : (2 * liquido * outros) / (raiz + b)
        : (raiz - b) / 2;
  }
  if (!Number.isFinite(bruto) || bruto < 0)
    throw new Error("Custo incompatível com o desconto e as despesas");
  return Number(bruto.toFixed(2));
}
