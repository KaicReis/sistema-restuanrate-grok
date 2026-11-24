import { check, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { PedidoRecebido } from "../anotai-receiver";

export const anotaiPedidosRecebidos = pgTable("anotai_pedidos_recebidos", {
  chave: text("chave").primaryKey(),
  hash: text("hash").notNull(),
  data: text("data").notNull(),
  pedido: jsonb("pedido").$type<PedidoRecebido>().notNull(),
  importadoEm: timestamp("importado_em", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index("anotai_pedidos_recebidos_data_idx").on(t.data),
  check("anotai_recepcao_chave_hex", sql`${t.chave} ~ '^[a-f0-9]{64}$'`),
  check("anotai_recepcao_hash_hex", sql`${t.hash} ~ '^[a-f0-9]{64}$'`),
  check("anotai_recepcao_data_iso", sql`${t.data} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`),
]);
