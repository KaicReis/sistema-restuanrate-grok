import { z } from "zod";
import { compraSchema } from "./purchases";
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
export const v3Schema = z.object({
  capitais: z.array(capitalSchema).optional(),
  compras: z.array(compraSchema).optional(),
  importacoes: z
    .array(z.object({ data: z.unknown(), criadoEm: z.string() }))
    .optional(),
});
