import { z } from "zod";
import type { Database } from "./types";

const inteiroNaoNegativo = z.number().int().nonnegative();
const competencia = z.string().regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/);

function fimDaCompetencia(mes: string) {
  const data = new Date(`${mes}-01T00:00:00Z`);
  data.setUTCMonth(data.getUTCMonth() + 1, 0);
  return `${mes}-${data.getUTCDate()}`;
}

export const totaisAnotaiSchema = z.strictObject({
  pedidos: inteiroNaoNegativo,
  subtotal: inteiroNaoNegativo,
  frete: inteiroNaoNegativo,
  total: inteiroNaoNegativo,
}).refine(
  ({ pedidos, subtotal, frete, total }) =>
    subtotal + frete === total && (pedidos > 0 || total === 0),
  "Valores incompatíveis com os pedidos e o frete informados.",
);

const painelAnotaiSchema = z.strictObject({
  pedidos: inteiroNaoNegativo,
  cancelados: inteiroNaoNegativo,
  totalVendas: inteiroNaoNegativo,
  periodoDe: z.iso.date(),
  periodoAte: z.iso.date(),
}).refine(
  ({ pedidos, cancelados, periodoDe, periodoAte }) => cancelados <= pedidos && periodoDe <= periodoAte,
  "O período e as contagens do painel precisam ser válidos.",
);

const conferenciaAnotaiSchema = z.strictObject({
  cancelados: totaisAnotaiSchema,
  expirados: totaisAnotaiSchema,
  rejeitados: totaisAnotaiSchema,
  descontosInformativosSemRejeitados: inteiroNaoNegativo,
  painel: painelAnotaiSchema.optional(),
});

const canaisAnotaiSchema = z.strictObject({
    delivery: totaisAnotaiSchema,
    retirada: totaisAnotaiSchema,
    salao: totaisAnotaiSchema,
  });

export const vendaAnotaiMensalSchema = z.strictObject({
  competencia,
  canais: canaisAnotaiSchema,
  expiradosPorCanal: canaisAnotaiSchema.optional(),
  pedidosExportados: inteiroNaoNegativo,
  salaoDesde: z.iso.date().optional(),
  periodoAte: z.iso.date().optional(),
  conferencia: conferenciaAnotaiSchema.optional(),
}).refine(
  ({ competencia, salaoDesde }) => !salaoDesde || salaoDesde.startsWith(competencia + "-"),
  { path: ["salaoDesde"], message: "A data de cobertura do salão deve pertencer à competência." },
).refine(
  ({ competencia, periodoAte }) => !periodoAte || periodoAte.startsWith(competencia + "-"),
  { path: ["periodoAte"], message: "A data final do relatório deve pertencer à competência." },
).refine(
  ({ canais, expiradosPorCanal, pedidosExportados, conferencia, competencia, periodoAte }) => {
    const totais = Object.values(canais);
    const pedidos = totais.reduce((soma, canal) => soma + canal.pedidos, 0);
    const total = totais.reduce((soma, canal) => soma + canal.total, 0);
    const outros = conferencia
      ? [conferencia.cancelados, conferencia.expirados, conferencia.rejeitados]
      : [];
    const linhas = pedidos + outros.reduce((soma, status) => soma + status.pedidos, 0);
    const totalExportado = total + outros.reduce((soma, status) => soma + status.total, 0);
    const expirados = Object.values(expiradosPorCanal ?? {});
    const corresponde = !expiradosPorCanal || !conferencia ||
      (["pedidos", "subtotal", "frete", "total"] as const).every((campo) =>
        expirados.reduce((soma, canal) => soma + canal[campo], 0) === conferencia.expirados[campo]);
    const linhasPagas = pedidos + expirados.reduce((soma, canal) => soma + canal.pedidos, 0);
    const painel = conferencia?.painel;
    return corresponde && linhasPagas <= pedidosExportados && (!painel || (painel.periodoDe === `${competencia}-01` &&
        painel.periodoAte === (periodoAte ?? fimDaCompetencia(competencia)))) &&
      (conferencia ? linhas === pedidosExportados : linhas <= pedidosExportados) &&
      Number.isSafeInteger(totalExportado + (conferencia?.descontosInformativosSemRejeitados ?? expirados.reduce((soma, canal) => soma + canal.total, 0)));
  },
  "Os totais dos canais devem ser compatíveis com os pedidos exportados.",
);

export const vendasAnotaiSchema = z.array(vendaAnotaiMensalSchema).refine(
  (meses) => new Set(meses.map(({ competencia }) => competencia)).size === meses.length,
  "Há mais de um registro de vendas do Anotaí na mesma competência.",
);

export type TotaisAnotai = z.infer<typeof totaisAnotaiSchema>;
export type VendaAnotaiMensal = z.infer<typeof vendaAnotaiMensalSchema>;

const faturamentoConsolidadoSchema = z.strictObject({
  competencia,
  valor: inteiroNaoNegativo,
  fonte: z.literal("anotai"),
  coberturaSalao: z.enum(["ausente", "parcial", "integral"]),
  periodoAte: z.iso.date().optional(),
}).refine(
  ({ competencia, periodoAte }) => !periodoAte || periodoAte.startsWith(competencia + "-"),
  { path: ["periodoAte"], message: "A data final do faturamento deve pertencer à competência." },
);

export const faturamentosConsolidadosSchema = z.array(faturamentoConsolidadoSchema).refine(
  (meses) => new Set(meses.map((mes) => mes.competencia)).size === meses.length,
  "Há mais de um faturamento consolidado na mesma competência.",
);

export type FaturamentoConsolidado = z.infer<typeof faturamentoConsolidadoSchema>;

export function pedidosRealizadosNoCanal(venda: VendaAnotaiMensal, canal: keyof VendaAnotaiMensal["canais"]): TotaisAnotai {
  const base = venda.canais[canal];
  const extra = venda.expiradosPorCanal?.[canal];
  if (!extra) return base;
  return {
    pedidos: base.pedidos + extra.pedidos,
    subtotal: base.subtotal + extra.subtotal,
    frete: base.frete + extra.frete,
    total: base.total + extra.total,
  };
}

export function totalizarVendasAnotai(venda: VendaAnotaiMensal) {
  return (["delivery", "retirada", "salao"] as const).map((canal) => pedidosRealizadosNoCanal(venda, canal)).reduce((soma, canal) => ({
    subtotal: soma.subtotal + canal.subtotal,
    pedidos: soma.pedidos + canal.pedidos,
  }), { subtotal: 0, pedidos: 0 });
}

export function conferirPainelAnotai(venda: VendaAnotaiMensal) {
  const conferencia = venda.conferencia;
  if (!conferencia) return undefined;
  const subtotal = Object.values(venda.canais).reduce((soma, canal) => soma + canal.subtotal, 0);
  const pedidos = Object.values(venda.canais).reduce((soma, canal) => soma + canal.pedidos, 0);
  const frete = Object.values(venda.canais).reduce((soma, canal) => soma + canal.frete, 0);
  const finalizados = { pedidos, subtotal, frete, total: subtotal + frete };
  const { cancelados, expirados, rejeitados, painel } = conferencia;
  const pedidosSemRejeitados = venda.pedidosExportados - rejeitados.pedidos;
  const totalSemRejeitados = finalizados.total + cancelados.total + expirados.total;
  const totalComDescontosRepostos = totalSemRejeitados + conferencia.descontosInformativosSemRejeitados;
  const mesmasContagens = painel?.pedidos === pedidosSemRejeitados &&
    painel.cancelados === cancelados.pedidos + expirados.pedidos;
  return {
    ...conferencia,
    finalizados,
    pedidosSemRejeitados,
    totalSemRejeitados,
    totalComDescontosRepostos,
    mesmasContagens,
    diferenca: painel === undefined ? undefined : painel.totalVendas - totalSemRejeitados,
  };
}
export function inicioSalaoAnotai(vendas: VendaAnotaiMensal[]) {
  return vendas.flatMap(({ salaoDesde }) => salaoDesde ? [salaoDesde] : []).sort()[0];
}

export function coberturaSalaoAnotai(venda: VendaAnotaiMensal, inicioSalao?: string) {
  const { competencia, periodoAte } = venda;
  const inicio = inicioSalao ?? venda.salaoDesde;
  if (!inicio) return pedidosRealizadosNoCanal(venda, "salao").pedidos > 0 ? "integral" : "ausente";
  if (inicio.slice(0, 7) > competencia || (periodoAte && inicio > periodoAte)) return "ausente";
  return inicio > `${competencia}-01` ? "parcial" : "integral";
}

export function faturamentoAnotai(
  venda: VendaAnotaiMensal,
  inicioSalao?: string,
): FaturamentoConsolidado {
  const { competencia, periodoAte } = venda;
  return {
    competencia,
    valor: totalizarVendasAnotai(venda).subtotal,
    fonte: "anotai",
    coberturaSalao: coberturaSalaoAnotai(venda, inicioSalao),
    ...(periodoAte ? { periodoAte } : {}),
  };
}

export function faturamentoConsolidadoNoMes(
  db: Pick<Database, "faturamentosConsolidados">,
  competencia: string,
) {
  return db.faturamentosConsolidados?.find((mes) => mes.competencia === competencia);
}
