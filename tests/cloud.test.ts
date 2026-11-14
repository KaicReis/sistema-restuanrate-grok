import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { workspaces, snapshots } from "../src/lib/server/schema";
import { criarBase } from "../src/lib/storage/seed";
import { migrar } from "../src/lib/storage/migrate";
const shared = vi.hoisted(() => ({
  db: null as unknown,
  authenticated: true,
  origin: true,
}));
vi.mock("../src/lib/server/db", () => ({ database: () => shared.db }));
vi.mock("../src/lib/server/auth", () => ({
  currentUser: async () => (shared.authenticated ? { id: "owner" } : null),
  sameOrigin: () => shared.origin,
}));
import { GET, PUT } from "../src/app/api/data/route";
const client = new PGlite();
const db = drizzle(client);
beforeAll(async () => {
  await client.exec(
    readFileSync("migrations/0000_parched_gertrude_yorkes.sql", "utf8"),
  );
  shared.db = db;
});
afterAll(async () => {
  await client.close();
});
const request = (revision: number, data = migrar(criarBase())) =>
  new Request("http://localhost/api/data", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision, data }),
  });
describe("API de sincronização com Postgres", () => {
  it("bloqueia usuários anônimos e origens externas", async () => {
    shared.authenticated = false;
    expect((await GET()).status).toBe(401);
    expect((await PUT(request(0))).status).toBe(401);
    shared.authenticated = true;
    shared.origin = false;
    expect((await PUT(request(0))).status).toBe(403);
    shared.origin = true;
  });
  it("inicializa e guarda todos os dados e snapshot em uma transação", async () => {
    expect((await (await GET()).json()).revision).toBe(0);
    expect((await PUT(request(0))).status).toBe(200);
    const result = await (await GET()).json();
    expect(result.revision).toBe(1);
    expect(result.data.insumos.length).toBeGreaterThan(0);
    expect(await db.select().from(snapshots)).toHaveLength(1);
  });
  it("rejeita criação duplicada e revisão antiga sem sobrescrever", async () => {
    expect((await PUT(request(0))).status).toBe(409);
    expect((await PUT(request(1))).status).toBe(200);
    expect((await PUT(request(1))).status).toBe(409);
    expect(
      (await db.select().from(workspaces).where(eq(workspaces.id, "vila")))[0]
        .revision,
    ).toBe(2);
    expect(await db.select().from(snapshots)).toHaveLength(2);
  });
  it("rejeita conteúdo inválido sem mudar a revisão", async () => {
    const data = migrar(criarBase());
    data.insumos[0].preco = -1;
    expect((await PUT(request(2, data))).status).toBe(400);
    expect((await (await GET()).json()).revision).toBe(2);
  });
});
