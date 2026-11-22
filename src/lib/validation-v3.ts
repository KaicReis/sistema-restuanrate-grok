import { z } from "zod";
import { compraRegistradaSchema } from "./purchases";
import { categoriasCaixa, LIMITE_CENTAVOS_CAIXA } from "./fluxo-caixa";
import { vendasAnotaiSchema } from "./vendas-anotai";
const num = z.number().finite().nonnegative();
export const capitalSchema = z.object({
  restaurante_id: z.string(),
  competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  faturamento: num.optional(),
  compras: num.optional(),
  fornecedores: num.optional(),
  estoqueReais: num.optional(),
  estoqueDias: num.optional(),
  fixos: num.optional(),
  aluguel: num.optional(),
  reserva: num.optional(),
  pagamentos: z
    .array(
      z.object({
        nome: z.string().max(500),
        percentual: num.max(100).optional(),
        dias: num.optional(),
      }),
    )
    .max(20),
});
const competencia = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const centavosCaixa = z.number().int().max(LIMITE_CENTAVOS_CAIXA);
const saldoCaixa = z.object({
  restaurante_id: z.string().min(1).max(500),
  competencia,
  saldoCentavos: centavosCaixa.min(-LIMITE_CENTAVOS_CAIXA),
});
const movimentoCaixa = z
  .object({
    id: z.string().min(1).max(500),
    restaurante_id: z.string().min(1).max(500),
    data: z.iso.date(),
    descricao: z.string().trim().min(1).max(180),
    tipo: z.enum(["entrada", "saida"]),
    categoria: z.enum([...categoriasCaixa.entrada, ...categoriasCaixa.saida]),
    situacao: z.enum(["previsto", "realizado"]),
    valorCentavos: centavosCaixa.positive(),
  })
  .refine(
    (m) =>
      categoriasCaixa[m.tipo].some((categoria) => categoria === m.categoria),
    "A categoria não pertence ao tipo de movimentação.",
  );
const centavosDre = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const fechamentoFinanceiro = z
  .object({
    restaurante_id: z.string().min(1).max(500),
    competencia,
    receitaBruta: centavosDre.optional(),
    descontos: centavosDre.optional(),
    estornos: centavosDre.optional(),
    impostos: centavosDre.optional(),
    fixos: centavosDre.optional(),
  })
  .refine(
    (d) =>
      d.receitaBruta === undefined ||
      (d.descontos ?? 0) <= d.receitaBruta - (d.estornos ?? 0),
    "Os descontos e estornos não podem superar a receita bruta.",
  );
export const v3Schema = z.object({
  saldosCaixa: z.array(saldoCaixa).max(20000).optional(),
  movimentosCaixa: z.array(movimentoCaixa).max(20000).optional(),
  fechamentosFinanceiros: z.array(fechamentoFinanceiro).max(20000).optional(),
  capitais: z.array(capitalSchema).optional(),
  compras: z.array(compraRegistradaSchema).optional(),
  vendasAnotai: vendasAnotaiSchema.optional(),
  importacoes: z
    .array(z.object({ data: z.unknown(), criadoEm: z.string() }))
    .optional(),
});
