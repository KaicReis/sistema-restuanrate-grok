import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { criarPilotoAnotai, pilotConfig } from "../src/lib/anotai-pilot-http";
import type { RegistroRecebido } from "../src/lib/anotai-receiver";
import type { ReceiverStore } from "../src/lib/anotai-receiver-http";

const sum = (s: string) => createHash("sha256").update(s).digest("hex");
const unitId = "aaaaaaaaaaaaaaaaaaaaaaaa", orderId = "bbbbbbbbbbbbbbbbbbbbbbbb", token = "a".repeat(43);
const t = Date.parse("2026-11-24T01:00:00Z");
const env = { VERCEL_ENV: "preview", ANOTAI_RECEIVER_ENABLED: "true", ANOTAI_RECEIVER_PREVIEW_FIXTURES_ONLY: "true",
  ANOTAI_RECEIVER_UNIT_ID: unitId, ANOTAI_PILOT_ENABLED: "true", ANOTAI_PILOT_TOKEN_SHA256: sum(token),
  ANOTAI_PILOT_ORDER_KEY: sum("anotai:" + unitId + ":" + orderId), ANOTAI_PILOT_EXPIRES_AT: "2026-11-24T02:00:00Z" };
const body = () => ({ orders: [{ source: "anotai", unitId, orderId, businessDate: "2026-11-23", reference: "19", status: "finalized",
  origin: "waiter-app", fulfillment: "LOCAL", orderTotalCents: 2530, freightCents: 0, tipCents: 230,
  items: [{ name: "Cerveja", valueCents: 800 }, { name: "Temaki", valueCents: 1500 }] }] });
function setup(overrides: Record<string, string> = {}) {
  let now = t, transactions = 0;
  const stored: RegistroRecebido[] = [];
  const store: Pick<ReceiverStore, "transaction"> = {
    async transaction(fn) {
      transactions++;
      return fn({
        async catalog() { return { produtos: [{ id: "a", nome: "Cerveja", restaurante_id: "bar" },
          { id: "b", nome: "Temaki", restaurante_id: "nativos" }],
          setores: [{ id: "bar", nome: "Bar" }, { id: "nativos", nome: "Nativo’s Sushi" }] }; },
        async existing(keys) { return stored.filter(r => keys.includes(r.key)); },
        async insert(rows) { stored.push(...rows); },
      });
    },
  };
  const handler = criarPilotoAnotai({ env: { ...env, ...overrides }, now: () => now, ...store });
  const post = (p: unknown, cred = token, extra: Record<string, string> = {}, query = "") =>
    handler(new Request("https://gestao.example/api/anotai/piloto" + query, { method: "POST", headers: {
      Authorization: "Bearer " + cred, "Content-Type": "application/json", ...extra,
    }, body: JSON.stringify(p) }));
  return { post, stored, expire: () => { now += 3600000; }, transactions: () => transactions };
}
describe("Piloto Windows direto e escopado a um pedido", () => {
  it("aceita rolamento idêntico e recusa pedido, loja, lote ou correção fora do escopo", async () => {
    const h = setup(), p = body();
    expect(await (await h.post(p)).json()).toEqual({ saved: 1, existing: 0 });
    expect(await (await h.post(p)).json()).toEqual({ saved: 0, existing: 1 });
    const another = body();
    another.orders[0].orderId = "cccccccccccccccccccccccc";
    expect((await h.post(another)).status).toBe(403);
    p.orders.push(another.orders[0]);
    expect((await h.post(p)).status).toBe(403);
    p.orders.pop(); p.orders[0].reference = "20";
    expect((await h.post(p)).status).toBe(409);
    p.orders[0].unitId = another.orders[0].orderId;
    expect((await h.post(p)).status).toBe(422);
    expect(h.stored).toHaveLength(1);
    expect(h.stored[0].order.allocated).toEqual([{ sectorId: "bar", cents: 800 }, { sectorId: "nativos", cents: 1500 }]);
  });
  it("nega credencial inválida, cookie, browser, query ou expirado antes de ler DB", async () => {
    const h = setup();
    expect((await h.post(body(), "b".repeat(43))).status).toBe(401);
    expect((await h.post(body(), token, { Origin: "https://gestao.example" })).status).toBe(404);
    expect((await h.post(body(), token, { Cookie: "secret" })).status).toBe(404);
    expect((await h.post(body(), token, {}, "?token=sensitive")).status).toBe(404);
    h.expire();
    expect((await h.post(body())).status).toBe(404);
    expect(h.transactions()).toBe(0);
  });
  it("produção fechada sem ambas as aprovações; classificação desconhecida não grava", async () => {
    expect(pilotConfig({ ...env, VERCEL_ENV: "production" }, t)).toBeNull();
    expect(pilotConfig({ ...env, VERCEL_ENV: "production", ANOTAI_RECEIVER_PRODUCTION_APPROVED: "true",
      ANOTAI_RECEIVER_UNIT_ID: "cccccccccccccccccccccccc" }, t)).toBeNull();
    expect(pilotConfig({ ...env, ANOTAI_PILOT_EXPIRES_AT: "2026-11-24T04:00:00Z" }, t)).toBeNull();
    const h = setup(), p = body();
    p.orders[0].items[0].name = "sem cadastro";
    expect((await h.post(p)).status).toBe(422);
    expect(h.stored).toHaveLength(0);
  });
});
