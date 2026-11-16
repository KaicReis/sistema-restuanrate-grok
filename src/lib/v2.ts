import type { Database, DNA, Insumo, Rateio } from "./types";
import {
  calcularPrecoDNA,
  entradaPreco,
  fixosOperacionais,
} from "./dna";
import { novoDNA } from "./storage/seed";
export function insumosMes(db: Database, mes: string): Insumo[] {
  return db.insumos.map((i) => {
    const keys = Object.keys(i.historicoPrecos ?? {})
      .filter((m) => m <= mes)
      .sort();
    const snapshot = i.historicoPrecos?.[keys[keys.length - 1] ?? ""];
    return snapshot
      ? { ...i, ...snapshot }
      : i.historicoPrecos && Object.keys(i.historicoPrecos).length
        ? { ...i, preco: 0, precoPendente: true }
        : i;
  });
}
export const operacoes = (db: Database) =>
  db.restaurantes.filter((r) => r.id !== "a-vila" && !r.grupo);
export function ratear(db: Database, mes: string): Record<string, number> {
  const ops = operacoes(db),
    aluguel = db.alugueis?.find((a) => a.competencia === mes);
  const result = Object.fromEntries(ops.map((r) => [r.id, 0]));
  if (!aluguel || !aluguel.valor) return result;
  const pesos = ops.map((r) =>
    aluguel.regra === "fixo"
      ? (aluguel.percentuais[r.id] ?? 0)
      : (db.dnas.find((d) => d.restaurante_id === r.id && d.competencia === mes)
          ?.faturamento ?? 0),
  );
  const total = pesos.reduce((s, v) => s + v, 0);
  if (aluguel.regra === "fixo" && Math.abs(total - 100) > 0.000001)
    throw new Error("Os percentuais fixos devem somar 100%.");
  if (!total) return result;
  const valores = pesos.map((p) => Math.floor((aluguel.valor * p) / total));
  const ordem = pesos
    .map((p, i) => ({ i, resto: (aluguel.valor * p) / total - valores[i] }))
    .sort((a, b) => b.resto - a.resto);
  for (
    let sobra = aluguel.valor - valores.reduce((s, v) => s + v, 0), i = 0;
    sobra > 0;
    sobra--, i++
  )
    valores[ordem[i].i]++;
  ops.forEach((r, i) => (result[r.id] = valores[i]));
  return result;
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
  const rows = operacoes(db).map((r) => {
    const dna = dnaComRateio(db, r.id, mes),
      fixos = fixosOperacionais(dna),
      receita = dna.faturamento;
    const cmv = dna.cmvReal ?? null,
      variaveis = dna.variaveisReais ?? null;
    const lucro =
      cmv !== null && variaveis !== null
        ? receita - cmv - variaveis - (receita * dna.imposto) / 100 - fixos
        : null;
    const contribuicao =
      cmv !== null && variaveis !== null && receita > 0
        ? 1 - (cmv + variaveis) / receita - dna.imposto / 100
        : null;
    return {
      id: r.id,
      nome: r.nome,
      receita,
      fixos,
      cmv,
      lucro,
      margem: lucro !== null && receita > 0 ? lucro / receita : null,
      equilibrio:
        contribuicao !== null && contribuicao > 0 ? fixos / contribuicao : null,
      tipo: dna.tipoFaturamento,
    };
  });
  const aluguel = db.alugueis?.find((a) => a.competencia === mes);
  const naoRateado =
    (aluguel?.valor ?? 0) -
    Object.values(ratear(db, mes)).reduce((s, v) => s + v, 0);
  const receita = rows.reduce((s, r) => s + r.receita, 0),
    fixos = rows.reduce((s, r) => s + r.fixos, 0) + naoRateado;
  const completos = rows.every((r) => r.lucro !== null);
  const cmv = completos ? rows.reduce((s, r) => s + r.cmv!, 0) : null,
    lucro = completos
      ? rows.reduce((s, r) => s + r.lucro!, 0) - naoRateado
      : null;
  const alertas: string[] = [];
  rows.forEach((r) => {
    if (r.margem !== null && r.margem < 0.3)
      alertas.push(`${r.nome}: margem abaixo da meta de 30%.`);
  });
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
          dnaComRateio(db, p.restaurante_id, mes),
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
  if (aluguel?.valor && !Object.values(ratear(db, mes)).some(Boolean))
    alertas.push(
      "Aluguel ainda não rateado: informe faturamento ou use percentuais fixos.",
    );
  return {
    rows,
    receita,
    fixos,
    cmv,
    lucro,
    margem: lucro !== null && receita > 0 ? lucro / receita : null,
    equilibrio:
      lucro !== null && receita > 0 && lucro + fixos > 0
        ? fixos / ((lucro + fixos) / receita)
        : null,
    alertas,
  };
}
export function validarRateio(a: Rateio, db: Database) {
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(a.competencia) ||
    !Number.isSafeInteger(a.valor) ||
    a.valor < 0 ||
    !["fixo", "faturamento"].includes(a.regra)
  )
    throw new Error("Aluguel inválido.");
  if (
    Object.values(a.percentuais).some(
      (v) => !Number.isFinite(v) || v < 0 || v > 100,
    )
  )
    throw new Error("Percentual inválido.");
  if (
    a.regra === "fixo" &&
    Math.abs(
      operacoes(db).reduce((s, r) => s + (a.percentuais[r.id] ?? 0), 0) - 100,
    ) > 0.000001
  )
    throw new Error("Os percentuais fixos devem somar 100%.");
}
