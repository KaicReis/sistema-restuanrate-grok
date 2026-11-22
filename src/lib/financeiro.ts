import Decimal from "decimal.js";
import { fixosOperacionais } from "./dna";
import type { Database } from "./types";
import { operacoes, rateioAluguel, receitaAposAbatimentos } from "./rateio";
import { faturamentoConsolidadoNoMes } from "./vendas-anotai";

export interface FechamentoFinanceiro {
  restaurante_id: string;
  competencia: string;
  receitaBruta?: number;
  descontos?: number;
  estornos?: number;
  impostos?: number;
  fixos?: number;
}

function somarCompleto(valores: (number | null | undefined)[]): number | null {
  if (!valores.length || valores.some((v) => v == null)) return null;
  return valores.reduce<number>((total, valor) => total + (valor ?? 0), 0);
}

function baseMensal(db: Database, mes: string, id: string) {
  const grupo = id === "a-vila";
  const operacoesSelecionadas = operacoes(db).filter(
    (operacao) => grupo || operacao.id === id,
  );
  const { valores: rateios, criterio } = rateioAluguel(db, mes);
  const totalAluguel = db.alugueis?.find((a) => a.competencia === mes)?.valor ?? 0;
  return {
    aluguel: grupo ? totalAluguel : (rateios[id] ?? 0),
    aluguelProvisorio: !grupo && rateios[id] > 0 && (criterio === "fixo-provisorio" || criterio === "igual-provisorio"),
    faturamentoConsolidado: grupo ? faturamentoConsolidadoNoMes(db, mes) : null,
    linhas: operacoesSelecionadas.map((operacao) => ({
      dna: db.dnas.find(
        (d) => d.restaurante_id === operacao.id && d.competencia === mes,
      ),
      fechamento: db.fechamentosFinanceiros?.find(
        (f) => f.restaurante_id === operacao.id && f.competencia === mes,
      ),
    })),
  };
}

function apurar({ linhas, aluguel, aluguelProvisorio, faturamentoConsolidado }: ReturnType<typeof baseMensal>) {
  const receitaBruta = somarCompleto(linhas.map(({ fechamento }) => fechamento?.receitaBruta));
  const descontos = somarCompleto(linhas.map(({ fechamento }) => fechamento?.descontos));
  const estornos = somarCompleto(linhas.map(({ fechamento }) => fechamento?.estornos));
  const impostos = somarCompleto(linhas.map(({ fechamento }) => fechamento?.impostos));
  const fixos = somarCompleto(linhas.map(({ fechamento }) => fechamento?.fixos));
  const cmv = somarCompleto(linhas.map(({ dna }) => dna?.cmvReal));
  const variaveis = somarCompleto(linhas.map(({ dna }) => dna?.variaveisReais));
  const receitaFechada = somarCompleto(linhas.map(({ fechamento }) => receitaAposAbatimentos(fechamento)));
  const receitaAnotai = receitaFechada === null ? faturamentoConsolidado ?? null : null;
  const receita = receitaFechada ?? receitaAnotai?.valor ?? null;
  const fonteReceita = receitaFechada !== null ? "dre" as const : receitaAnotai ? "anotai" as const : null;
  const receitaParcial = Boolean(receitaAnotai &&
    (receitaAnotai.periodoAte || receitaAnotai.coberturaSalao !== "integral"));
  const contribuicao = receitaParcial || receita === null || impostos === null || cmv === null || variaveis === null
    ? null
    : receita - impostos - cmv - variaveis;
  const resultado = contribuicao === null || fixos === null || aluguel === null
    ? null
    : contribuicao - fixos - aluguel;
  return {
    receitaBruta, descontos, estornos, receita, fonteReceita, receitaAnotai, receitaParcial, impostos, cmv, variaveis,
    contribuicao, fixos, aluguel, aluguelProvisorio, resultado,
    margem: receita !== null && receita > 0 && resultado !== null ? resultado / receita : null,
  };
}

export function demonstrativo(db: Database, mes: string, id: string) {
  return apurar(baseMensal(db, mes, id));
}

export function baseEquilibrio(db: Database, mes: string, id: string) {
  const base = baseMensal(db, mes, id);
  const dre = apurar(base);
  const fixosRealizados = somarCompleto([dre.fixos, dre.aluguel]);
  const fixosReferencia = somarCompleto([
    somarCompleto(
      base.linhas.map(({ fechamento, dna }) =>
        fechamento?.fixos ??
        (dna?.fixos.some((fixo) => fixo.natureza === "operacional")
          ? fixosOperacionais(dna)
          : null),
      ),
    ),
    dre.aluguel,
  ]);
  const receitaReal = dre.receitaParcial ? null : dre.receita;
  const receitaPositiva = receitaReal !== null && receitaReal > 0 ? receitaReal : null;
  const taxaReal = (valor: number | null) =>
    receitaPositiva !== null && valor !== null ? valor / receitaPositiva : null;
  const impostosRealizados = taxaReal(dre.impostos);
  const faturamentoReferencia = somarCompleto(
    base.linhas.map(({ dna }) => dna?.faturamento),
  );
  const impostosReferencia = somarCompleto(
    base.linhas.map(({ dna }) =>
      dna ? (dna.imposto / 100) * dna.faturamento : null,
    ),
  );
  const impostoDna = base.linhas.length === 1 && base.linhas[0].dna
    ? base.linhas[0].dna.imposto / 100
    : faturamentoReferencia !== null && faturamentoReferencia > 0 && impostosReferencia !== null
      ? impostosReferencia / faturamentoReferencia
      : null;
  return {
    receitaReal,
    fixos: fixosRealizados ?? fixosReferencia,
    fonteFixos: fixosRealizados !== null ? "realizado" as const : fixosReferencia !== null ? "dna" as const : null,
    aliquotas: {
      cmv: taxaReal(dre.cmv),
      variaveis: taxaReal(dre.variaveis),
      impostos: impostosRealizados ?? impostoDna,
    },
    fonteAliquotas: receitaPositiva !== null && dre.cmv !== null && dre.variaveis !== null && impostosRealizados !== null
      ? "realizado" as const
      : impostoDna !== null && impostosRealizados === null ? "dna" as const : null,
  };
}

export function calcularEquilibrio(
  fixos: number | null,
  margemContribuicao: number | null,
  receitaReal: number | null,
  diasRestantes: number | null,
) {
  const margem = margemContribuicao === null
    ? 0
    : Number.isFinite(margemContribuicao) ? Number(margemContribuicao.toFixed(12)) : 0;
  const meta = fixos !== null && fixos >= 0 && Number.isSafeInteger(fixos) && margem > 0
    ? new Decimal(fixos).div(margem).ceil().toNumber()
    : null;
  const ponto = meta !== null && Number.isSafeInteger(meta) ? meta : null;
  const falta = ponto !== null && receitaReal !== null
    ? Math.max(0, ponto - receitaReal)
    : null;
  const porDia = falta !== null && diasRestantes !== null && diasRestantes > 0
    ? Math.ceil(falta / diasRestantes)
    : null;
  return { ponto, falta, porDia };
}
