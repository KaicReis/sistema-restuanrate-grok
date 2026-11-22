import { z } from "zod";

const inteiroNaoNegativo = z.number().int().nonnegative();

const vendaSetorSchema = z.strictObject({
  restaurante_id: z.string().min(1).max(500),
  unidades: inteiroNaoNegativo,
  valor: inteiroNaoNegativo,
}).refine(
  ({ unidades, valor }) => unidades > 0 || valor === 0,
  "O setor precisa ter unidades classificadas para registrar um valor.",
);

export const vendaSetorEstimadaMensalSchema = z.strictObject({
  competencia: z.string().regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/),
  unidadesNoArquivo: inteiroNaoNegativo,
  setores: z.array(vendaSetorSchema),
  relatorioParcial: z.boolean().optional(),
}).refine(
  ({ setores }) => new Set(setores.map((s) => s.restaurante_id)).size === setores.length,
  { path: ["setores"], message: "Há setores repetidos na mesma competência." },
).refine(
  ({ setores, unidadesNoArquivo }) =>
    setores.reduce((soma, setor) => soma + setor.unidades, 0) <= unidadesNoArquivo &&
    Number.isSafeInteger(setores.reduce((soma, setor) => soma + setor.valor, 0)),
  { path: ["setores"], message: "A soma dos setores deve ser compatível com o arquivo." },
);

export const vendasSetoresEstimadasSchema = z.array(vendaSetorEstimadaMensalSchema).refine(
  (meses) => new Set(meses.map(({ competencia }) => competencia)).size === meses.length,
  "Há mais de uma estimativa de vendas por setor na mesma competência.",
);

export type VendaSetorEstimadaMensal = z.infer<typeof vendaSetorEstimadaMensalSchema>;
