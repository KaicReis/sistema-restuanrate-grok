import { z } from "zod";

const condicao = z.object({
  id: z.string().trim().min(1).max(500),
  forma: z.string().trim().min(1, "Informe a forma de pagamento.").max(80),
  bandeira: z.string().trim().min(1).max(80).optional(),
  percentual: z.number().min(0).max(100),
  dias: z.number().int().nonnegative(),
});

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

export const recebimentosSchema = z
  .array(condicao)
  .refine(
    (regras) => new Set(regras.map((regra) => regra.id)).size === regras.length,
    "Condições de recebimento duplicadas.",
  )
  .refine(
    (regras) =>
      new Set(
        regras.map((regra) =>
          JSON.stringify([normalizar(regra.forma), normalizar(regra.bandeira ?? "")]),
        ),
      ).size === regras.length,
    "Use uma condição de recebimento por forma de pagamento e bandeira.",
  );
