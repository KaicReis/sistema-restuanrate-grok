import { z } from "zod";

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
