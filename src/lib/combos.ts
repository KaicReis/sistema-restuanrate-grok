import Decimal from "decimal.js";
import { dnaParaPrecificacao } from "./base-precificacao";
import { calcularMargens, calcularPrecoDNA, custoUnidadeUso, entradaPreco, insumoDeEmbalagem } from "./dna";
import type { Canal, Database, Registro } from "./types";
import { dnaComRateio, insumosMes } from "./v2";

export interface Combo extends Registro {
  nome: string;
  canal: string;
  itens: { produto_id: string; quantidade: number }[];
  preco?: number;
  embalagem?: number;
  embalagens?: { insumo_id: string; quantidade: number }[];
}

export function cotarCombo(db: Database, combo: Combo, canal: Canal) {
  if (canal.restaurante_id !== combo.restaurante_id || canal.nome !== combo.canal)
    throw new Error("Canal do combo indisponível no mês.");
  const dna = dnaParaPrecificacao(db, dnaComRateio(db, combo.restaurante_id, canal.competencia));
  const insumos = insumosMes(db, canal.competencia);
  const insumosEmbalagem = insumos.filter((i) => i.restaurante_id === combo.restaurante_id && insumoDeEmbalagem(i));
  const substituirEmbalagem = combo.embalagem !== undefined || Boolean(combo.embalagens?.length);
  const custoEmbalagem = combo.embalagens?.reduce((total, item) => {
    const insumo = insumosEmbalagem.find((i) => i.id === item.insumo_id);
    if (!insumo) throw new Error("Revise as embalagens do combo.");
    if (insumo.precoPendente) throw new Error(`Informe o custo de ${insumo.nome}.`);
    return total.plus(custoUnidadeUso(insumo, "un").times(item.quantidade));
  }, new Decimal(0));
  const entradas = combo.itens.map(({ produto_id, quantidade }) => {
    const produto = db.produtos.find((p) => p.id === produto_id && p.restaurante_id === combo.restaurante_id);
    if (!produto || produto.pendente) throw new Error(`Complete a ficha de ${produto?.nome ?? "um dos produtos"}.`);
    try {
      const ficha = substituirEmbalagem
        ? { ...produto, itens: produto.itens.filter((item) =>
          item.receita_id || !insumosEmbalagem.some((i) => i.id === item.insumo_id),
        ) }
        : produto;
      const avulso = db.precos.find((p) =>
        p.canal_id === canal.id && p.produto_id === produto_id && p.restaurante_id === combo.restaurante_id,
      )?.valor;
      return { quantidade, avulso, entrada: entradaPreco(dna, canal, ficha, insumos, db.receitas) };
    } catch {
      throw new Error(`Revise os ingredientes e custos de ${produto.nome}.`);
    }
  });
  if (!entradas.length) throw new Error("Adicione produtos ao combo.");
  const soma = (campo: "cmvIngredientes" | "embalagem") => entradas.reduce(
    (total, { entrada, quantidade }) => total.plus(new Decimal(entrada[campo] ?? 0).times(quantidade)),
    new Decimal(0),
  );
  const entrada = {
    ...entradas[0].entrada,
    cmvIngredientes: soma("cmvIngredientes"),
    embalagem: custoEmbalagem?.toNumber() ?? combo.embalagem ?? soma("embalagem").toNumber(),
  };
  return {
    avulsos: entradas.every(({ avulso }) => avulso !== undefined)
      ? entradas.reduce((total, { avulso, quantidade }) => total + avulso! * quantidade, 0)
      : null,
    custo: entrada.cmvIngredientes.plus(entrada.embalagem).plus(entrada.custoFixoUnidade ?? 0),
    minimo: calcularPrecoDNA(entrada),
    margem: combo.preco === undefined ? null : calcularMargens(entrada, combo.preco),
  };
}
