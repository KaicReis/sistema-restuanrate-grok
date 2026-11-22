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

const itemSemEstimativaSchema = z.strictObject({
  item: z.string().trim().min(1).max(500),
  unidades: z.number().int().positive(),
  motivo: z.enum(["preco", "setor", "produto"]),
});

export const vendaSetorEstimadaMensalSchema = z.strictObject({
  competencia: z.string().regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/),
  unidadesNoArquivo: inteiroNaoNegativo,
  unidadesExcluidas: inteiroNaoNegativo.optional(),
  setores: z.array(vendaSetorSchema),
  relatorioParcial: z.boolean().optional(),
  periodoAte: z.iso.date().optional(),
  itensPendentes: z.array(itemSemEstimativaSchema).max(500).optional(),
}).refine(
  ({ competencia, periodoAte }) => !periodoAte || periodoAte.startsWith(competencia + "-"),
  { path: ["periodoAte"], message: "A data final da estimativa deve pertencer à competência." },
).refine(
  ({ setores }) => new Set(setores.map((s) => s.restaurante_id)).size === setores.length,
  { path: ["setores"], message: "Há setores repetidos na mesma competência." },
).refine(
  ({ setores, itensPendentes, unidadesNoArquivo, unidadesExcluidas = 0 }) => {
    const processadas = setores.reduce((soma, setor) => soma + setor.unidades, 0);
    const considerado = unidadesNoArquivo - unidadesExcluidas;
    const pendentes = itensPendentes?.reduce((soma, item) => soma + item.unidades, 0);
    return (
      (pendentes === undefined ? processadas <= considerado : processadas + pendentes === considerado) &&
      Number.isSafeInteger(setores.reduce((soma, setor) => soma + setor.valor, 0))
    );
  },
  { path: ["setores"], message: "A soma dos setores deve ser compatível com o arquivo." },
);

export const vendasSetoresEstimadasSchema = z.array(vendaSetorEstimadaMensalSchema).refine(
  (meses) => new Set(meses.map(({ competencia }) => competencia)).size === meses.length,
  "Há mais de uma estimativa de vendas por setor na mesma competência.",
);

export type VendaSetorEstimadaMensal = z.infer<typeof vendaSetorEstimadaMensalSchema>;
