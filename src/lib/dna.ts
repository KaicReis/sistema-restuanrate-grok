import Decimal from "decimal.js";
import type { Canal, DNA, Insumo, Produto } from "./types";
Decimal.set({ precision: 32 });
export interface EntradaDNA {
  faturamentoReferencia: number;
  custosFixosOperacionais: number;
  variaveis: number;
  impostos: number;
  margem: number;
  cmvIngredientes: number | Decimal;
  embalagem?: number;
  custoFixoUnidade?: number;
}
export type ResultadoDNA =
  | {
      viavel: true;
      percentualFixos: number;
      cmvMaximoPercentual: number;
      markup: number;
      precoMinimo: number;
    }
  | { viavel: false; motivo: string };
// Valores monetários em centavos; taxas em decimais (0,30 = 30%).
export function calcularPrecoDNA(e: EntradaDNA): ResultadoDNA {
  const values = [
    e.faturamentoReferencia,
    e.custosFixosOperacionais,
    e.variaveis,
    e.impostos,
    e.margem,
    e.embalagem ?? 0,
    e.custoFixoUnidade ?? 0,
  ];
  const cmvValido = Decimal.isDecimal(e.cmvIngredientes)
    ? e.cmvIngredientes.isFinite() && e.cmvIngredientes.gte(0)
    : Number.isFinite(e.cmvIngredientes) && e.cmvIngredientes >= 0;
  if (
    !cmvValido ||
    values.some((v) => !Number.isFinite(v) || v < 0) ||
    [e.variaveis, e.impostos, e.margem].some((v) => v > 1)
  )
    return {
      viavel: false,
      motivo:
        "Informe valores válidos e não negativos. Taxas devem estar entre 0% e 100%.",
    };
  if (e.faturamentoReferencia === 0)
    return {
      viavel: false,
      motivo: "Informe um faturamento de referência maior que zero.",
    };
  const f = new Decimal(e.custosFixosOperacionais).div(e.faturamentoReferencia);
  const denominador = new Decimal(1)
    .minus(f)
    .minus(e.variaveis)
    .minus(e.impostos)
    .minus(e.margem);
  if (denominador.lte(0))
    return { viavel: false, motivo: "O DNA não comporta a margem desejada" };
  const custo = new Decimal(e.cmvIngredientes)
    .plus(e.embalagem ?? 0)
    .plus(e.custoFixoUnidade ?? 0);
  const precoMinimo = custo.div(denominador).ceil();
  if (!precoMinimo.isFinite() || precoMinimo.gt(Number.MAX_SAFE_INTEGER))
    return {
      viavel: false,
      motivo:
        "O preço calculado excede o limite monetário suportado. Revise os valores do DNA.",
    };
  return {
    viavel: true,
    percentualFixos: f.toNumber(),
    cmvMaximoPercentual: denominador.toNumber(),
    markup: new Decimal(1).div(denominador).toNumber(),
    precoMinimo: precoMinimo.toNumber(),
  };
}
export function unidadeUso(insumo: Insumo) {
  return ["kg", "g"].includes(insumo.unidade)
    ? "g"
    : ["L", "ml"].includes(insumo.unidade)
      ? "ml"
      : "un";
}
export function custoUnidadeUso(insumo: Insumo): Decimal {
  if (
    !Number.isFinite(insumo.quantidade) ||
    insumo.quantidade <= 0 ||
    !Number.isFinite(insumo.preco) ||
    insumo.preco < 0 ||
    !Number.isFinite(insumo.rendimento) ||
    insumo.rendimento <= 0 ||
    insumo.rendimento > 100
  )
    throw new Error("Insumo com quantidade, preço ou rendimento inválido.");
  const fator = ["kg", "L"].includes(insumo.unidade) ? 1000 : 1;
  return new Decimal(insumo.preco).div(
    new Decimal(insumo.quantidade)
      .times(fator)
      .times(insumo.rendimento)
      .div(100),
  );
}
export function calcularCMVDecimal(
  produto: Produto,
  insumos: Insumo[],
): Decimal {
  if (
    !Number.isFinite(produto.rendimento) ||
    produto.rendimento <= 0 ||
    !produto.itens.length
  )
    throw new Error("Inclua ingredientes e um rendimento maior que zero.");
  let total = new Decimal(0);
  for (const item of produto.itens) {
    const insumo = insumos.find(
      (i) =>
        i.id === item.insumo_id && i.restaurante_id === produto.restaurante_id,
    );
    if (!insumo)
      throw new Error("Insumo da ficha não encontrado neste restaurante.");
    if (
      !Number.isFinite(item.quantidade) ||
      item.quantidade <= 0 ||
      !Number.isFinite(item.perda) ||
      item.perda < 0 ||
      item.perda >= 100
    )
      throw new Error("Quantidade deve ser positiva e perda menor que 100%.");
    total = total.plus(
      custoUnidadeUso(insumo)
        .times(item.quantidade)
        .div(new Decimal(1).minus(new Decimal(item.perda).div(100))),
    );
  }
  return total.div(produto.rendimento);
}
// Conversão apenas para exibição e consumidores que precisam de number.
export function calcularCMV(produto: Produto, insumos: Insumo[]): number {
  return calcularCMVDecimal(produto, insumos).toNumber();
}
export function fixosOperacionais(dna: DNA) {
  return dna.fixos
    .filter((f) => f.natureza === "operacional")
    .reduce((s, f) => s + f.valor, 0);
}
export function taxaCanal(canal: Canal) {
  return canal.taxas
    .reduce((s, t) => s.plus(t.percentual), new Decimal(0))
    .div(100)
    .toNumber();
}
export function entradaPreco(
  dna: DNA,
  canal: Canal,
  produto: Produto,
  insumos: Insumo[],
): EntradaDNA {
  if (
    dna.restaurante_id !== canal.restaurante_id ||
    dna.restaurante_id !== produto.restaurante_id ||
    dna.competencia !== canal.competencia
  )
    throw new Error(
      "DNA, canal e produto devem pertencer ao mesmo restaurante e competência.",
    );
  return {
    faturamentoReferencia: dna.faturamento,
    custosFixosOperacionais: fixosOperacionais(dna),
    variaveis: taxaCanal(canal),
    impostos: dna.imposto / 100,
    margem: dna.margem / 100,
    cmvIngredientes: calcularCMVDecimal(produto, insumos),
    embalagem: canal.embalagem ?? produto.embalagem,
    custoFixoUnidade: canal.custoUnidade,
  };
}
export function calcularMargens(e: EntradaDNA, preco: number) {
  if (!Number.isFinite(preco) || preco <= 0 || e.faturamentoReferencia <= 0)
    return null;
  const p = new Decimal(preco),
    custo = new Decimal(e.cmvIngredientes)
      .plus(e.embalagem ?? 0)
      .plus(e.custoFixoUnidade ?? 0);
  const contribuicao = p
    .minus(custo)
    .minus(p.times(new Decimal(e.variaveis).plus(e.impostos)));
  return {
    margem: contribuicao
      .div(p)
      .minus(
        new Decimal(e.custosFixosOperacionais).div(e.faturamentoReferencia),
      )
      .toNumber(),
    contribuicao: contribuicao.toNumber(),
    contribuicaoPercentual: contribuicao.div(p).toNumber(),
  };
}
export function dnaDaCompetencia(
  dnas: DNA[],
  restauranteId: string,
  competencia: string,
) {
  return dnas.find(
    (d) => d.restaurante_id === restauranteId && d.competencia === competencia,
  );
}
export const dinheiro = (centavos: number | Decimal) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    new Decimal(centavos).div(100).toNumber(),
  );
export const percentual = (valor: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(valor);
export function paraCentavos(valor: string | number) {
  const d = new Decimal(valor || 0)
    .times(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  if (!d.isFinite() || d.lt(0) || d.gt(Number.MAX_SAFE_INTEGER))
    throw new Error("Valor monetário inválido.");
  return d.toNumber();
}
