import { z } from "zod";
import type { Database } from "./types";

const inteiroNaoNegativo = z.number().int().nonnegative();
const competencia = z.string().regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/);

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

export const vendaAnotaiMensalSchema = z.strictObject({
  competencia,
  canais: z.strictObject({
    delivery: totaisAnotaiSchema,
    retirada: totaisAnotaiSchema,
    salao: totaisAnotaiSchema,
  }),
  pedidosExportados: inteiroNaoNegativo,
  salaoDesde: z.iso.date().optional(),
  periodoAte: z.iso.date().optional(),
}).refine(
  ({ competencia, salaoDesde }) => !salaoDesde || salaoDesde.startsWith(competencia + "-"),
  { path: ["salaoDesde"], message: "A data de cobertura do salão deve pertencer à competência." },
).refine(
  ({ competencia, periodoAte }) => !periodoAte || periodoAte.startsWith(competencia + "-"),
  { path: ["periodoAte"], message: "A data final do relatório deve pertencer à competência." },
).refine(
  ({ canais, pedidosExportados }) => {
    const totais = Object.values(canais);
    const pedidos = totais.reduce((soma, canal) => soma + canal.pedidos, 0);
    const total = totais.reduce((soma, canal) => soma + canal.total, 0);
    return pedidos <= pedidosExportados && Number.isSafeInteger(total);
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

export function totalizarVendasAnotai(venda: VendaAnotaiMensal) {
  return Object.values(venda.canais).reduce((soma, canal) => ({
    subtotal: soma.subtotal + canal.subtotal,
    pedidos: soma.pedidos + canal.pedidos,
  }), { subtotal: 0, pedidos: 0 });
}

export function inicioSalaoAnotai(vendas: VendaAnotaiMensal[]) {
  return vendas.flatMap(({ salaoDesde }) => salaoDesde ? [salaoDesde] : []).sort()[0];
}

export function coberturaSalaoAnotai(venda: VendaAnotaiMensal, inicioSalao?: string) {
  const { competencia, periodoAte } = venda;
  const inicio = inicioSalao ?? venda.salaoDesde;
  if (!inicio) return venda.canais.salao.pedidos > 0 ? "integral" : "ausente";
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
