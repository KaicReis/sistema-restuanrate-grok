import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { workspaces, snapshots } from "../src/lib/server/schema";
import { anotaiPedidosRecebidos } from "../src/lib/server/anotai-pedidos-schema";
import { criarBase } from "../src/lib/storage/seed";
const shared = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../src/lib/server/db", () => ({ database: () => shared.db }));
vi.mock("../src/lib/server/auth", () => ({ currentUser: async () => ({ role: "owner" }), sameOrigin: () => true }));
import { GET } from "../src/app/api/anotai/pedidos/route";
import { POST } from "../src/app/api/anotai/piloto/route";
import { createHash } from "node:crypto";
const client = new PGlite(), db = drizzle(client);
const host = "http://localhost", unitId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const body = { orders: [{ source: "anotai", unitId, orderId: "bbbbbbbbbbbbbbbbbbbbbbbb",
  businessDate: "2026-11-23", reference: "19", status: "finalized", origin: "waiter-app", fulfillment: "LOCAL",
  orderTotalCents: 2530, tipCents: 230, freightCents: 0, merchandiseCents: 2300,
  items: [{ name: "Cerveja", valueCents: 800 }, { name: "Temaki", valueCents: 1500 }] }] };
const token = "x".repeat(43);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const post = (payload: unknown, bearer = token) =>
  POST(new Request(host + "/api/anotai/piloto", { method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + bearer },
    body: JSON.stringify(payload) }));
beforeAll(async () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("ANOTAI_RECEIVER_ENABLED", "true");
  vi.stubEnv("ANOTAI_RECEIVER_PREVIEW_FIXTURES_ONLY", "true");
  vi.stubEnv("ANOTAI_RECEIVER_UNIT_ID", unitId);
  vi.stubEnv("ANOTAI_PILOT_ENABLED", "true");
  vi.stubEnv("ANOTAI_PILOT_TOKEN_SHA256", hash(token));
  vi.stubEnv("ANOTAI_PILOT_ORDER_KEY", hash("anotai:" + unitId + ":" + body.orders[0].orderId));
  vi.stubEnv("ANOTAI_PILOT_EXPIRES_AT", new Date(Date.now() + 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"));
  await migrate(db, { migrationsFolder: "./migrations" });
  shared.db = db;
  const data = criarBase();
  const item = { rendimento: 1, itens: [], embalagem: 0, pendente: true };
  data.produtos = [
    { ...item, id: "beer-fixture", nome: "Cerveja", restaurante_id: "bar" },
    { ...item, id: "temaki-fixture", nome: "Temaki", restaurante_id: "nativos" },
  ];
  await db.insert(workspaces).values({ id: "vila", data, revision: 24 });
});
afterAll(async () => { vi.unstubAllEnvs(); await client.close(); });
describe("Piloto Windows direto e leitura no Gestão em PostgreSQL isolado", () => {
  it("token não é sessão; grava um único pedido e torna consultável ao responsável", async () => {
    const estadoAntes = await db.select().from(workspaces);
    expect((await post(body, "y".repeat(43))).status).toBe(401);
    expect(await db.select().from(anotaiPedidosRecebidos)).toHaveLength(0);
    const respostas = await Promise.all([post(body), post(body)]);
    expect(respostas.map(r => r.status)).toEqual([200, 200]);
    expect((await Promise.all(respostas.map(r => r.json()))).map(r => r.saved).sort()).toEqual([0, 1]);
    const lidos = await GET(new Request(host + "/api/anotai/pedidos?mes=2026-11"));
    expect(await lidos.json()).toMatchObject({ rows: [{ reference: "19", origin: "waiter-app", fulfillment: "LOCAL",
      allocated: [{ sectorId: "bar", cents: 800 }, { sectorId: "nativos", cents: 1500 }],
      totalCents: 2530, merchandiseCents: 2300, tipCents: 230, pending: [] }] });
    const alterado = structuredClone(body);
    alterado.orders[0].reference = "20";
    expect((await post(alterado)).status).toBe(409);
    alterado.orders[0].orderId = "cccccccccccccccccccccccc";
    expect((await post(alterado)).status).toBe(403);
    expect(await db.select().from(anotaiPedidosRecebidos)).toHaveLength(1);
    expect(await db.select().from(workspaces)).toEqual(estadoAntes);
    expect(await db.select().from(snapshots)).toHaveLength(0);
  });
});
