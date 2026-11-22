import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "node:fs";
import { eq, isNull } from "drizzle-orm";
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
  await client.exec(readFileSync("migrations/0001_amusing_moon_knight.sql", "utf8"));
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
const consultar = (meta = false) =>
  GET(new Request("http://localhost/api/data" + (meta ? "?meta=1" : "")));
describe("API de sincronização com Postgres", () => {
  it("bloqueia usuários anônimos e origens externas", async () => {
    shared.authenticated = false;
    expect((await consultar()).status).toBe(401);
    expect((await consultar(true)).status).toBe(401);
    expect((await PUT(request(0))).status).toBe(401);
    shared.authenticated = true;
    shared.origin = false;
    expect((await PUT(request(0))).status).toBe(403);
    shared.origin = true;
  });
  it("inicializa e guarda todos os dados e snapshot em uma transação", async () => {
    expect(await (await consultar(true)).json()).toEqual({ revision: 0 });
    expect((await (await consultar()).json()).revision).toBe(0);
    expect((await PUT(request(0))).status).toBe(200);
    const result = await (await consultar()).json();
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
    const data = structuredClone(migrar(criarBase()));
    data.insumos[0].preco = -1;
    expect((await PUT(request(2, data))).status).toBe(400);
    expect((await (await consultar()).json()).revision).toBe(2);
  });
  it("mantém as 20 revisões mais recentes e preserva cópias legadas", async () => {
    const data = migrar(criarBase());
    await db.insert(snapshots).values({ id: "legado", data });
    for (let revision = 2; revision < 24; revision++) {
      expect((await PUT(request(revision, data))).status).toBe(200);
    }
    const todas = await db.select({ revision: snapshots.revision }).from(snapshots).orderBy(snapshots.revision);
    expect(todas.map(({ revision }) => revision)).toEqual([
      ...Array.from({ length: 20 }, (_, indice) => indice + 5), null,
    ]);
    expect(await db.select({ id: snapshots.id }).from(snapshots).where(isNull(snapshots.revision))).toEqual([{ id: "legado" }]);
    expect((await (await consultar()).json()).revision).toBe(24);
  });
  it("responde ao monitoramento com a revisão e aceita somente um escritor concorrente", async () => {
    const meta = await consultar(true);
    expect(meta.headers.get("Cache-Control")).toBe("no-store");
    const { revision } = await meta.json();
    expect(await (await consultar(true)).json()).toEqual({ revision });
    const a = migrar(criarBase());
    const b = structuredClone(a);
    a.restaurantes[0].nome = "A Vila — primeira gravação";
    b.restaurantes[0].nome = "A Vila — segunda gravação";
    const [respostaA, respostaB] = await Promise.all([PUT(request(revision, a)), PUT(request(revision, b))]);
    expect([respostaA.status, respostaB.status].sort()).toEqual([200, 409]);
    expect(await (await consultar(true)).json()).toEqual({ revision: revision + 1 });
    const { data } = await (await consultar()).json();
    expect(data.restaurantes[0].nome).toBe((respostaA.ok ? a : b).restaurantes[0].nome);
  });
});
