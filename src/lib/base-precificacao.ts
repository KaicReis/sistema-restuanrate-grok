import Decimal from "decimal.js";
import { z } from "zod";
import { receitaAposAbatimentos } from "./rateio";
import { resumoVendas } from "./resumo-vendas";
import { inicioSalaoAnotai } from "./vendas-anotai";
import type { Database, DNA } from "./types";

const centavos = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const anoBase = z.number().int().min(2000).max(2100);
const competencia = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const realizadoOuEstimado = z.enum(["anotai", "dre", "dna", "estimativa", "estimativa_cobertura"]);
type Fonte = z.infer<typeof realizadoOuEstimado>;
const mesBase = z.strictObject({
  competencia,
  valor: centavos,
  fonte: z.enum([...realizadoOuEstimado.options, "substituido"]),
});
export const basePrecificacaoSchema = z.discriminatedUnion("modo", [
  z.strictObject({ modo: z.literal("mensal"), restaurante_id: z.string().min(1).max(500) }),
  z.strictObject({ modo: z.literal("manual"), restaurante_id: z.string().min(1).max(500), valor: centavos.min(1) }),
  z.strictObject({
    modo: z.literal("media"),
    restaurante_id: z.string().min(1).max(500),
    valor: centavos.min(1),
    ano: anoBase,
    meses: z.array(mesBase).min(1).max(12),
    menorMes: competencia,
  }),
]).superRefine((base, ctx) => {
  if (base.modo !== "media") return;
  const pior = base.meses.find((mes) => mes.competencia === base.menorMes && mes.fonte !== "substituido");
  const consistente = pior && base.meses.every((mes, i) =>
    mes.competencia === `${base.ano}-${String(i + 1).padStart(2, "0")}` &&
    (mes.fonte === "substituido" ? mes.valor === pior.valor : mes.valor >= pior.valor));
  if (!consistente || mediaCentavos(base.meses) !== base.valor) {
    ctx.addIssue({ code: "custom", message: "A memória de cálculo da base de precificação não confere." });
  }
});

export type BasePrecificacao = z.infer<typeof basePrecificacaoSchema>;
type FonteMensal = Pick<Database, "dnas" | "fechamentosFinanceiros" | "vendasAnotai" | "vendasSetorCanal" | "vendasSetoresEstimadas">;
type MesComFonte = { competencia: string; valor: number; fonte: Fonte };
type Sugestao = { ano: number; meses: z.infer<typeof mesBase>[]; menorMes: string; valor: number };

function mediaCentavos(meses: readonly { valor: number }[]) {
  return meses.reduce((total, mes) => total.plus(mes.valor), new Decimal(0)).div(meses.length).round().toNumber();
}

function valorDoMes(db: FonteMensal, setor: string, mes: string): MesComFonte | null {
  const vendas = resumoVendas(db, mes, setor);
  if (vendas.totalDetalhado !== undefined && !vendas.parcial) {
    return { competencia: mes, valor: vendas.totalDetalhado, fonte: "anotai" };
  }

  const dre = receitaAposAbatimentos(db.fechamentosFinanceiros?.find(
    (item) => item.restaurante_id === setor && item.competencia === mes,
  ));
  if (dre !== null) return { competencia: mes, valor: dre, fonte: "dre" };

  const dna = db.dnas.find((item) =>
    item.restaurante_id === setor && item.competencia === mes &&
    item.tipoFaturamento === "realizado" && !item.historico,
  );
  if (dna) return { competencia: mes, valor: dna.faturamento, fonte: "dna" };

  const relatorio = db.vendasSetoresEstimadas?.find((item) => item.competencia === mes);
  if (!relatorio || relatorio.relatorioParcial || relatorio.periodoAte || relatorio.itensPendentes?.length) return null;
  const classificadas = relatorio.setores.reduce((total, item) => total + item.unidades, 0);
  if (classificadas !== relatorio.unidadesNoArquivo - (relatorio.unidadesExcluidas ?? 0)) return null;
  const item = relatorio.setores.find(({ restaurante_id }) => restaurante_id === setor);
  if (!item) return null;
  // O relatório de itens é uma fonte distinta. Um mês inteiro elegível para
  // planejamento não comprova cobertura do salão quando o Anotaí não a tem.
  const inicioSalao = inicioSalaoAnotai(db.vendasAnotai ?? []);
  const coberturaNaoComprovada = vendas.venda ? vendas.coberturaSalao !== "integral" :
    Boolean(inicioSalao && inicioSalao > `${mes}-01`);
  return { competencia: mes, valor: item.valor, fonte: coberturaNaoComprovada ? "estimativa_cobertura" : "estimativa" };
}

// O mês corrente e os meses futuros nunca entram no cálculo, nem como substituição.
export function sugerirBasePrecificacao(db: FonteMensal, setor: string, ano: number, mesAtual: string): Sugestao | null {
  if (!anoBase.safeParse(ano).success || setor === "a-vila" || !competencia.safeParse(mesAtual).success) return null;
  const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`)
    .filter((mes) => mes < mesAtual);
  const apurados = meses.map((mes) => valorDoMes(db, setor, mes));
  const pior = apurados.reduce<MesComFonte | null>((menor, mes) =>
    mes && (!menor || mes.valor < menor.valor) ? mes : menor, null);
  if (!pior) return null;
  const completados = meses.map((competencia, i) => apurados[i] ?? {
    competencia, valor: pior.valor, fonte: "substituido" as const,
  });
  return { ano, meses: completados, menorMes: pior.competencia, valor: mediaCentavos(completados) };
}

export function dnaParaPrecificacao(db: Pick<Database, "basesPrecificacao">, dna: DNA): DNA {
  const base = db.basesPrecificacao?.find(({ restaurante_id }) => restaurante_id === dna.restaurante_id);
  return !base || base.modo === "mensal" ? dna : { ...dna, faturamento: base.valor };
}
