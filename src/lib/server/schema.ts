import { index, pgTable, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import type { Database } from "../types";
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("staff"),
});
export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});
export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  data: jsonb("data").$type<Database>().notNull(),
  revision: integer("revision").notNull().default(1),
});
export const snapshots = pgTable("snapshots", {
  id: text("id").primaryKey(),
  data: jsonb("data").$type<Database>().notNull(),
  revision: integer("revision"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [index("snapshots_revision_idx").on(t.revision)]);
export const attempts = pgTable("login_attempts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export { anotaiPedidosRecebidos } from "./anotai-pedidos-schema";
