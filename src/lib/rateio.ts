import Decimal from "decimal.js";
import type { FechamentoFinanceiro } from "./financeiro";
import type { Database, Rateio } from "./types";

export const operacoes = (db: Database) =>
  db.restaurantes.filter((r) => r.id !== "a-vila" && !r.grupo);

export const operacoesDoAluguel = (db: Database) =>
  operacoes(db).filter(({ id, nome }) => !/\bvinhos?\b/i.test(`${id} ${nome}`));

export function receitaAposAbatimentos(fechamento?: FechamentoFinanceiro) {
  if (fechamento?.receitaBruta === undefined ||
      fechamento.descontos === undefined || fechamento.estornos === undefined) return null;
  return fechamento.receitaBruta - fechamento.descontos - fechamento.estornos;
}

type CriterioRateio = "sem-aluguel" | "sem-operacoes" | "fixo" | "realizado" | "fixo-provisorio" | "igual-provisorio";

function percentuaisFixos(a: Rateio, db: Database) {
  const soma = (lista: ReturnType<typeof operacoes>) => lista.reduce(
    (total, { id }) => total + (a.percentuais[id] ?? 0), 0,
  );
  if (Math.abs(soma(operacoesDoAluguel(db)) - 100) < 0.000001) return true;
  // Backups antigos podiam incluir Vinhos. A proporção é ajustada entre os participantes atuais.
  return Math.abs(soma(operacoes(db)) - 100) < 0.000001;
}

export function rateioAluguel(db: Database, mes: string): {
  valores: Record<string, number>;
  criterio: CriterioRateio;
} {
  const aluguel = db.alugueis?.find((a) => a.competencia === mes);
  const valores = Object.fromEntries(operacoes(db).map(({ id }) => [id, 0]));
  if (!aluguel?.valor) return { valores, criterio: "sem-aluguel" };
  const participantes = operacoesDoAluguel(db);
  if (!participantes.length) return { valores, criterio: "sem-operacoes" };

  const realizado = participantes.map(({ id }) => {
    const fechamento = db.fechamentosFinanceiros?.find((f) => f.restaurante_id === id && f.competencia === mes);
    const dna = db.dnas.find((d) => d.restaurante_id === id && d.competencia === mes);
    return receitaAposAbatimentos(fechamento) ?? (dna?.tipoFaturamento === "realizado" ? dna.faturamento : null);
  });
  const realizadoCompleto = realizado.every((v): v is number => v !== null && v >= 0) &&
    realizado.some((v) => v > 0);
  const fixos = participantes.map(({ id }) => aluguel.percentuais[id] ?? 0);
  const temPercentuais = percentuaisFixos(aluguel, db) && fixos.some((p) => p > 0);
  if (aluguel.regra === "fixo" && !percentuaisFixos(aluguel, db))
    throw new Error("Os percentuais fixos devem somar 100%.");

  const criterio = aluguel.regra === "faturamento" && realizadoCompleto ? "realizado"
    : temPercentuais ? (aluguel.regra === "fixo" ? "fixo" : "fixo-provisorio") : "igual-provisorio";
  const pesos = criterio === "realizado" ? realizado.map((v) => v ?? 0)
    : criterio === "fixo" || criterio === "fixo-provisorio" ? fixos : participantes.map(() => 1);
  const somaPesos = pesos.reduce((total, peso) => total.plus(peso), new Decimal(0));
  const cotas = pesos.map((peso, i) => {
    const bruto = new Decimal(aluguel.valor).times(peso).div(somaPesos);
    const inteiro = bruto.floor().toNumber();
    valores[participantes[i].id] = inteiro;
    return { id: participantes[i].id, resto: bruto.minus(inteiro) };
  }).sort((a, b) => b.resto.comparedTo(a.resto));
  const sobra = aluguel.valor - Object.values(valores).reduce((total, valor) => total + valor, 0);
  for (const { id } of cotas.slice(0, sobra)) valores[id]++;
  return { valores, criterio };
}

export const ratear = (db: Database, mes: string) => rateioAluguel(db, mes).valores;

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
  if (a.regra === "fixo" && !percentuaisFixos(a, db))
    throw new Error("Os percentuais fixos devem somar 100%.");
}
