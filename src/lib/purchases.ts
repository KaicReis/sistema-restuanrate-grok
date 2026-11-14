import { z } from "zod";
import type { Database, Unidade } from "./types";
export const linhaSchema = z.object({
  nome: z.string().min(1).max(500),
  quantidade: z.number().positive().max(1e9),
  unidade: z.enum(["kg", "g", "L", "ml", "un"]),
  valorUnitario: z.number().nonnegative().max(1e10),
  total: z.number().nonnegative().max(1e10),
  insumo_id: z.string().optional(),
  ignorar: z.boolean().optional(),
});
export const compraSchema = z.object({
  id: z.string().min(1),
  restaurante_id: z.string().min(1),
  fornecedor: z.string().min(1).max(500),
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (v) =>
        !Number.isNaN(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v,
      "Data inválida",
    ),
  itens: z.array(linhaSchema).min(1).max(300),
});
// Extração e revisão usam reais; somente a confirmação converte em centavos.
export type Compra = z.infer<typeof compraSchema>;
export function sugerirInsumo(db: Database, operacao: string, nome: string) {
  const normal = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .trim();
  const n = normal(nome);
  return (
    db.insumos
      .filter((i) => i.restaurante_id === operacao)
      .find((i) => normal(i.nome) === n)?.id ??
    db.insumos
      .filter((i) => i.restaurante_id === operacao)
      .find(
        (i) =>
          n.length > 3 &&
          (normal(i.nome).includes(n) || n.includes(normal(i.nome))),
      )?.id
  );
}
export function confirmarCompra(db: Database, input: Compra) {
  const compra = compraSchema.parse(input);
  if (
    !db.restaurantes.some(
      (r) => r.id === compra.restaurante_id && !r.grupo && r.id !== "a-vila",
    )
  )
    throw new Error("Operação inválida");
  if (db.compras?.some((c) => c.id === compra.id))
    throw new Error("Compra já confirmada");
  if (compra.itens.every((i) => i.ignorar))
    throw new Error("Selecione pelo menos um item");
  const mes = compra.data.slice(0, 7);
  for (const linha of compra.itens) {
    if (linha.ignorar) continue;
    if (
      Math.abs(linha.total - linha.quantidade * linha.valorUnitario) >
      Math.max(0.05, linha.total * 0.01)
    )
      throw new Error(
        "Total diverge de quantidade × valor unitário: " + linha.nome,
      );
    let insumo = db.insumos.find(
      (i) =>
        i.id === linha.insumo_id && i.restaurante_id === compra.restaurante_id,
    );
    if (linha.insumo_id && !insumo)
      throw new Error("Insumo de outra operação ou inexistente");
    if (!insumo) {
      insumo = {
        id: crypto.randomUUID(),
        restaurante_id: compra.restaurante_id,
        nome: linha.nome,
        unidade: linha.unidade as Unidade,
        quantidade: linha.quantidade,
        preco: Math.round(linha.total * 100),
        rendimento: 100,
        historicoPrecos: {},
      };
      db.insumos.push(insumo);
      linha.insumo_id = insumo.id;
    }
    // Snapshot da embalagem comprada, com quantidade e unidade revisadas: mantém conversão do custo por unidade.
    const h = {
      preco: Math.round(linha.total * 100),
      quantidade: linha.quantidade,
      unidade: linha.unidade,
      rendimento: insumo.rendimento,
      precoPendente: false,
    };
    insumo.historicoPrecos ??= {
      "0000-01": {
        preco: insumo.preco,
        quantidade: insumo.quantidade,
        unidade: insumo.unidade,
        rendimento: insumo.rendimento,
        precoPendente: insumo.precoPendente,
      },
    };
    insumo.historicoPrecos[mes] = h;
    const latest = Object.keys(insumo.historicoPrecos).sort().at(-1);
    if (latest === mes) Object.assign(insumo, h);
  }
  db.compras ??= [];
  db.compras.push(compra);
}
