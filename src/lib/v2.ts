import { dnaParaPrecificacao } from "./base-precificacao";
import type { Database, DNA, Insumo } from "./types";
import {
  calcularPrecoDNA,
  entradaPreco,
  fixosOperacionais,
} from "./dna";
import { novoDNA } from "./storage/seed";
import { calcularEquilibrio, demonstrativo } from "./financeiro";
import { operacoes, rateioAluguel, ratear } from "./rateio";

export { operacoes, operacoesDoAluguel, rateioAluguel, ratear, validarRateio } from "./rateio";
export function insumosMes(db: Database, mes: string): Insumo[] {
  return db.insumos.map((i) => {
    const keys = Object.keys(i.historicoPrecos ?? {})
      .filter((m) => m <= mes)
      .sort();
    const snapshot = i.historicoPrecos?.[keys[keys.length - 1] ?? ""];
    return snapshot
      ? { ...i, ...snapshot, unidadesNaCompra: snapshot.unidadesNaCompra }
      : i.historicoPrecos && Object.keys(i.historicoPrecos).length
        ? { ...i, preco: 0, precoPendente: true, unidadesNaCompra: undefined }
        : i;
  });
}
export function dnaComRateio(db: Database, id: string, mes: string): DNA {
  const d =
    db.dnas.find((d) => d.restaurante_id === id && d.competencia === mes) ??
    novoDNA(id, mes);
  const valor = ratear(db, mes)[id] ?? 0;
  return {
    ...d,
    fixos: [
      ...d.fixos,
      ...(valor
        ? [
            {
              id: "rateio-aluguel",
              categoria: "Ocupação",
              descricao: "Aluguel rateado · A Vila",
              valor,
              natureza: "operacional" as const,
            },
          ]
        : []),
    ],
  };
}
export function consolidar(db: Database, mes: string) {
  const dre = demonstrativo(db, mes, "a-vila");
  const rateio = rateioAluguel(db, mes);
  const rows = operacoes(db).map(({ id, nome }) => {
    const dna = dnaComRateio(db, id, mes);
    const setor = demonstrativo(db, mes, id);
    return {
      id, nome,
      receita: setor.receita,
      fixos: fixosOperacionais(dna),
      margem: setor.margem,
      metaMargem: dna.margem / 100,
      aluguel: setor.aluguel,
    };
  });
  const aluguel = db.alugueis?.find((a) => a.competencia === mes)?.valor ?? 0;
  const naoRateado = aluguel - Object.values(rateio.valores).reduce((s, valor) => s + valor, 0);
  const fixos = rows.reduce((s, r) => s + r.fixos, 0) + naoRateado;
  const alertas = rows.flatMap((r) =>
    r.margem !== null && r.margem < r.metaMargem
      ? [`${r.nome}: margem abaixo da meta do DNA.`] : [],
  );
  const insumos = insumosMes(db, mes);
  for (const p of db.precos) {
    const c = db.canais.find(
        (c) => c.id === p.canal_id && c.competencia === mes,
      ),
      produto = db.produtos.find((x) => x.id === p.produto_id);
    if (!c || !produto || !rows.some((r) => r.id === p.restaurante_id))
      continue;
    try {
      const e = entradaPreco(
          dnaParaPrecificacao(db, dnaComRateio(db, p.restaurante_id, mes)),
          c,
          produto,
          insumos,
          db.receitas,
        ),
        v = calcularPrecoDNA(e);
      if (v.viavel && p.valor < v.precoMinimo)
        alertas.push(`${produto.nome} · ${c.nome}: preço abaixo do sugerido.`);
    } catch {
      /* pendências exibidas separadamente */
    }
  }
  if (naoRateado > 0)
    alertas.push("Aluguel ainda não rateado: nenhuma operação participa do rateio.");
  const totalFixos = dre.fixos === null || dre.aluguel === null ? null : dre.fixos + dre.aluguel;
  const margemContribuicao = dre.contribuicao !== null && dre.receita !== null && dre.receita > 0
    ? dre.contribuicao / dre.receita : null;
  return {
    rows,
    receita: dre.receita,
    fonteReceita: dre.fonteReceita,
    receitaAnotai: dre.receitaAnotai,
    receitaParcial: dre.receitaParcial,
    fixos,
    cmv: dre.cmv,
    lucro: dre.resultado,
    margem: dre.margem,
    equilibrio: calcularEquilibrio(totalFixos, margemContribuicao, dre.receita, null).ponto,
    alertas,
  };
}
