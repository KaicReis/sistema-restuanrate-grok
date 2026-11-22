import Decimal from "decimal.js";
import { insumoArquivado } from "./insumos";
import { normalizarPrecoInsumo, type PrecoInsumo } from "./relatorio-insumos";
import type { Database, ItemFicha, Produto } from "./types";

type PrecoNormalizado = NonNullable<ReturnType<typeof normalizarPrecoInsumo>>;

export type AltaInsumo = {
  atual: PrecoNormalizado;
  anterior: PrecoNormalizado;
  referenciaAnterior: string;
  variacao: number | null;
};

export function compararPrecosInsumo(atual: PrecoInsumo, anterior: PrecoInsumo, referenciaAnterior: string): AltaInsumo | null {
  const novo = normalizarPrecoInsumo(atual);
  const antigo = normalizarPrecoInsumo(anterior);
  if (!novo || !antigo || novo.unidade !== antigo.unidade || antigo.valor < 0 || novo.valor <= antigo.valor) return null;
  return {
    atual: novo,
    anterior: antigo,
    referenciaAnterior,
    variacao: antigo.valor === 0 ? null : (novo.valor - antigo.valor) / antigo.valor,
  };
}

function rotuloReferencia(competencia: string) {
  if (competencia === "0000-01") return "preço de referência sem data";
  return competencia.split("-").reverse().join("/");
}

function consomeInsumo(itens: ItemFicha[], insumoId: string) {
  return itens.some((item) => !item.receita_id && item.insumo_id === insumoId && item.quantidade > 0);
}

export function pratosQueUsamInsumo(db: Pick<Database, "produtos" | "receitas">, setor: string, insumoId: string) {
  const receitas = (db.receitas ?? []).filter((receita) => receita.restaurante_id === setor);
  const receitasPorId = new Map(receitas.map((receita) => [receita.id, receita]));
  const dependentes = new Map<string, string[]>();
  for (const receita of receitas) {
    for (const item of receita.itens) {
      if (!item.receita_id || item.quantidade <= 0) continue;
      const pais = dependentes.get(item.receita_id) ?? [];
      pais.push(receita.id);
      dependentes.set(item.receita_id, pais);
    }
  }

  const atingidas = new Set(receitas.filter((receita) => consomeInsumo(receita.itens, insumoId)).map(({ id }) => id));
  const fila = [...atingidas];
  for (let indice = 0; indice < fila.length; indice++) {
    for (const dependente of dependentes.get(fila[indice]) ?? []) {
      if (atingidas.has(dependente)) continue;
      atingidas.add(dependente);
      fila.push(dependente);
    }
  }

  return db.produtos
    .filter((produto) => produto.restaurante_id === setor)
    .flatMap((produto) => {
      const direto = consomeInsumo(produto.itens, insumoId);
      const ids = new Set(produto.itens.flatMap((item) =>
        item.receita_id && item.quantidade > 0 && atingidas.has(item.receita_id) ? [item.receita_id] : [],
      ));
      const viaReceitas = [...ids].map((id) => receitasPorId.get(id)!.nome).sort((a, b) => a.localeCompare(b, "pt-BR"));
      return direto || viaReceitas.length ? [{ produto, direto, viaReceitas }] : [];
    })
    .sort((a, b) => a.produto.nome.localeCompare(b.produto.nome, "pt-BR"));
}

type CompraInsumo = { data: string; preco: PrecoInsumo };

export type AltaManualInsumo = {
  insumoId: string;
  mes: string;
  alta: AltaInsumo;
};

export type AlertaInsumo = {
  insumoId: string;
  nome: string;
  alta: AltaInsumo;
  pratos: { produto: Produto; direto: boolean; viaReceitas: string[] }[];
};

export function alertasDeInsumos(db: Database, setor: string, mes: string, manual?: AltaManualInsumo | null): AlertaInsumo[] {
  const comprasPorInsumo = new Map<string, CompraInsumo[]>();
  for (const compra of db.compras ?? []) {
    if (compra.restaurante_id !== setor || !compra.data.startsWith(`${mes}-`)) continue;
    const vistos = new Set<string>();
    for (const linha of [...compra.itens].reverse()) {
      if (!linha.insumo_id || linha.ignorar || linha.conversaoPendente || vistos.has(linha.insumo_id)) continue;
      vistos.add(linha.insumo_id);
      const precos = comprasPorInsumo.get(linha.insumo_id) ?? [];
      precos.push({
        data: compra.data,
        preco: {
          unidade: linha.unidade,
          quantidade: linha.conteudo ?? 1,
          preco: new Decimal(linha.valorUnitario).times(100).toNumber(),
        },
      });
      comprasPorInsumo.set(linha.insumo_id, precos);
    }
  }

  return db.insumos.flatMap((insumo) => {
    if (insumo.restaurante_id !== setor || insumoArquivado(insumo)) return [];
    const historico = insumo.historicoPrecos ?? {};
    const snapshot = historico[mes];
    const atual = snapshot ? normalizarPrecoInsumo(snapshot) : null;
    if (!atual || !snapshot) return [];

    const altaManual = manual?.mes === mes && manual.insumoId === insumo.id ? manual.alta : null;
    let alta = altaManual?.atual.valor === atual.valor && altaManual.atual.unidade === atual.unidade ? altaManual : null;
    const precosConfirmados = comprasPorInsumo.get(insumo.id) ?? [];
    const ultimaCompra = precosConfirmados.at(-1);
    const precoDaUltimaCompra = ultimaCompra ? normalizarPrecoInsumo(ultimaCompra.preco) : null;

    // Compras confirmadas atualizam o snapshot na ordem de registro. A coincidência
    // do preço e unidade permite usar a nota anterior como referência intramês.
    if (!alta && precoDaUltimaCompra?.valor === atual.valor && precoDaUltimaCompra.unidade === atual.unidade) {
      const anterior = precosConfirmados.at(-2);
      if (anterior) alta = compararPrecosInsumo(snapshot, anterior.preco, `compra de ${rotuloReferencia(anterior.data)}`);
    }

    if (!alta) {
      const anterior = Object.entries(historico)
        .filter(([competencia, preco]) => competencia < mes && !preco.precoPendente)
        .sort(([a], [b]) => b.localeCompare(a))[0];
      if (anterior) alta = compararPrecosInsumo(snapshot, anterior[1], rotuloReferencia(anterior[0]));
    }

    return alta ? [{ insumoId: insumo.id, nome: insumo.nome, alta, pratos: pratosQueUsamInsumo(db, setor, insumo.id) }] : [];
  }).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
