import { describe, expect, it } from "vitest";
import { prepararPedidos, receiverConfig, type RegistroRecebido } from "../src/lib/anotai-receiver";
import { criarReceiverAnotai } from "../src/lib/anotai-receiver-http";

const unit = "aaaaaaaaaaaaaaaaaaaaaaaa";
const env = { ANOTAI_RECEIVER_ENABLED: "true", ANOTAI_RECEIVER_UNIT_ID: unit,
  VERCEL_ENV: "preview", ANOTAI_RECEIVER_PREVIEW_FIXTURES_ONLY: "true" };
const produtos = [
  { id: "p1", nome: "Cerveja", restaurante_id: "bar" },
  { id: "p2", nome: "Temaki", restaurante_id: "nativos" },
  { id: "seed-p111", nome: "Long neck", restaurante_id: "nativos" },
];
const setores = [{ id: "bar", nome: "Bar" }, { id: "nativos", nome: "Nativo’s Sushi" }];
const sample = () => ({
  orders: [{ source: "anotai", unitId: unit, orderId: "bbbbbbbbbbbbbbbbbbbbbbbb", businessDate: "2026-11-23",
    reference: "19", status: "finalized", origin: "waiter-app", fulfillment: "LOCAL", merchandiseCents: 2300,
    orderTotalCents: 2530, freightCents: 0, tipCents: 230,
    items: [{ productId: "dddddddddddddddddddddddd", externalId: "|3|", name: "Cerveja", quantity: 1, valueCents: 800 },
            { productId: "ffffffffffffffffffffffff", externalId: null, name: "Temaki", quantity: 1, valueCents: 1500 }] }],
});
function harness(opts: { role?: "owner" | "staff" | null; disabled?: boolean } = {}) {
  const rows: RegistroRecebido[] = [];
  const use = { inserts: 0, transactions: 0 };
  let catalog = { produtos, setores };
  const host = "https://gestao.example";
  const receiver = criarReceiverAnotai({
    env: opts.disabled ? {} : env,
    currentUser: async () => opts.role === null ? null : { role: opts.role ?? "owner" },
    sameOrigin: r => r.headers.get("origin") === host,
    async readMonth(month) { return rows.filter(r => r.order.businessDate.startsWith(month + "-")).map(r => r.order); },
    async transaction(fn) {
      use.transactions++;
      return fn({
        catalog: async () => catalog,
        existing: async keys => rows.filter(r => keys.includes(r.key)),
        insert: async next => { use.inserts++; rows.push(...next); },
      });
    },
  });
  const get = (month = "2026-11") => receiver.GET(new Request(host + "/api/anotai/pedidos?mes=" + month));
  const post = (action: string, payload: unknown, fingerprint?: string, origin = host) => receiver.POST(
    new Request(host + "/api/anotai/pedidos", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload, ...(fingerprint ? { fingerprint } : {}) }) }),
  );
  return { get, post, rows, use, setCatalog: (next: typeof catalog) => { catalog = next; } };
}

describe("Gestão recebe lotes Anotaí", () => {
  it("conferência é somente leitura, proprietário registra e vê Bar/Sushi no mesmo pedido e reenvio não duplica", async () => {
    const h = harness();
    const body = sample();
    const before = await h.get();
    expect(await before.json()).toEqual({ rows: [] });
    const preview = await h.post("preview", body);
    expect(preview.status).toBe(200);
    expect(preview.headers.get("cache-control")).toContain("no-store");
    const v = await preview.json();
    expect(v).toMatchObject({ newCount: 1, alreadyReceived: 0, rows: [{
      reference: "19", origin: "waiter-app", fulfillment: "LOCAL", merchandiseCents: 2300, tipCents: 230,
      allocated: [{ sectorId: "bar", cents: 800 }, { sectorId: "nativos", cents: 1500 }], pending: [],
    }] });
    expect(h.use.inserts).toBe(0);
    const s = await h.post("commit", body, v.fingerprint);
    expect(await s.json()).toEqual({ saved: 1, existing: 0 });
    const live = await h.get();
    expect(await live.json()).toEqual({ rows: v.rows });
    expect(await (await h.get("2026-12")).json()).toEqual({ rows: [] });
    body.orders[0].items.reverse();
    expect(await (await h.post("commit", body, v.fingerprint)).json()).toEqual({ saved: 0, existing: 1 });
    expect(h.use.inserts).toBe(1);
    expect(JSON.stringify(h.rows)).not.toContain(body.orders[0].orderId);
    expect(JSON.stringify(h.rows)).not.toMatch(/Cerveja|Temaki|\|3\|/);
  });

  it("protege desligado, anônimo, membro e origem diferente antes de qualquer transação", async () => {
    for (const [params, code] of [[{ disabled: true }, 404], [{ role: null }, 401], [{ role: "staff" }, 403]] as const) {
      const h = harness(params);
      expect((await h.get()).status).toBe(code);
      expect((await h.post("preview", sample())).status).toBe(code);
      expect(h.use.transactions).toBe(0);
    }
    const h = harness();
    expect((await h.post("preview", sample(), undefined, "https://other.example")).status).toBe(403);
    expect(h.use.transactions).toBe(0);
    expect(receiverConfig({ ...env, VERCEL_ENV: "production" })).toBeNull();
    expect(receiverConfig({ ...env, ANOTAI_RECEIVER_UNIT_ID: "cccccccccccccccccccccccc" })).toBeNull();
  });

  it("rejeita loja, dados pessoais, duplicação no lote, formato monetário e totais não conciliados", async () => {
    const h = harness();
    let body = sample();
    body.orders[0].unitId = "cccccccccccccccccccccccc";
    expect((await h.post("preview", body)).status).toBe(422);
    body = sample();
    expect((await h.post("preview", { orders: [{ ...body.orders[0], customer: "Não reter" }] })).status).toBe(422);
    body.orders.push(body.orders[0]);
    expect((await h.post("preview", body)).status).toBe(422);
    body = sample();
    body.orders[0].orderTotalCents++;
    expect((await h.post("preview", body)).status).toBe(422);
    body = sample();
    body.orders[0].merchandiseCents++;
    expect((await h.post("preview", body)).status).toBe(422);
    expect((await h.post("preview", { text: "x".repeat(270000) })).status).toBe(400);
    expect(h.use.inserts).toBe(0);
  });

  it("não sobrescreve pedidos anteriores e uma prévia obsoleta não grava", async () => {
    const h = harness(), body = sample();
    const first = await (await h.post("preview", body)).json();
    expect((await h.post("commit", body, "0".repeat(64))).status).toBe(409);
    h.setCatalog({ produtos: produtos.slice(1), setores });
    expect((await h.post("commit", body, first.fingerprint)).status).toBe(409);
    expect(h.use.inserts).toBe(0);
    const now = await (await h.post("preview", body)).json();
    expect((await h.post("commit", body, now.fingerprint)).status).toBe(200);
    body.orders[0].reference = "20";
    body.orders.push({ ...sample().orders[0], orderId: "cccccccccccccccccccccccc" });
    expect((await h.post("preview", body)).status).toBe(409);
    expect(h.rows).toHaveLength(1);
  });

  it("pendências não são adivinhadas, nem guardam nomes crus; total alocado+pendente continua exato", () => {
    const body = sample();
    body.orders[0].items[0].name = "Long neck";
    body.orders[0].items[1].name = "Nome não cadastrado";
    const [x] = prepararPedidos(body, unit, produtos, setores);
    expect(x.order.allocated).toEqual([]);
    expect(x.order.pending.map(p => p.cents).reduce((n, c) => n + c, 0)).toBe(2300);
    expect(JSON.stringify(x.order)).not.toContain("Nome não cadastrado");
    expect(x.order.pending.some(p => p.reason.includes("cadastro único no Bar"))).toBe(true);
  });

  it("classifica só a Long neck revisada no Bar e mantém variante pendente", () => {
    const body = sample();
    const bar = { id: "long-neck-bar", nome: "Long neck", restaurante_id: "bar" };
    body.orders[0].items[0].name = " LONG   NECK  ";
    const origem = [...produtos, bar];
    const [ok] = prepararPedidos(body, unit, origem, setores);
    expect(ok.order.allocated).toEqual([{ sectorId: "bar", cents: 800 }, { sectorId: "nativos", cents: 1500 }]);
    expect(ok.order.pending).toEqual([]);
    const [semBar] = prepararPedidos(body, unit, origem, setores.filter(s => s.id !== "bar"));
    const [duplicado] = prepararPedidos(body, unit, [...origem, { ...bar, id: "duplicado" }], setores);
    for (const resultado of [semBar, duplicado]) {
      expect(resultado.order.pending).toMatchObject([{ cents: 800, items: 1 }]);
      expect(resultado.order.allocated).toEqual([{ sectorId: "nativos", cents: 1500 }]);
    }
    body.orders[0].items[0].name = "Corona Long neck";
    const [variante] = prepararPedidos(body, unit, [...origem, { id: "var", nome: "Corona Long neck", restaurante_id: "nativos" }], setores);
    expect(variante.order.pending).toMatchObject([{ cents: 800, items: 1 }]);
    expect(variante.order.allocated).toEqual([{ sectorId: "nativos", cents: 1500 }]);
  });

});
