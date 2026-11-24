import { describe, expect, it } from "vitest";
import { resumirPedidosRecebidos } from "../src/components/resumo-pedidos-recebidos-anotai";
import type { PedidoRecebido } from "../src/lib/anotai-receiver";

const order = (other: Partial<PedidoRecebido> = {}): PedidoRecebido => ({
  businessDate: "2026-11-23", reference: "19", origin: "waiter-app", fulfillment: "LOCAL",
  totalCents: 2730, merchandiseCents: 2500, freightCents: 0, tipCents: 230,
  allocated: [{ sectorId: "bar", cents: 800 }, { sectorId: "nativos", cents: 1500 }],
  pending: [{ reason: "não cadastrado", cents: 200, items: 1 }], ...other,
});
describe("Subtotal por setor nos pedidos recebidos", () => {
  it("separa frete, gorjeta e pendências e conta uma compra mista uma vez em cada setor", () => {
    const r = resumirPedidosRecebidos([order()]);
    expect(r).toEqual({ pedidos: 1, datas: 1, setores: [
      { sectorId: "nativos", centavos: 1500, pedidos: 1 }, { sectorId: "bar", centavos: 800, pedidos: 1 }],
      pendentes: 200, itensPendentes: 1, pedidosComPendencia: 1 });
  });
  it("origem e modalidade são interseção; não infere um a partir do outro", () => {
    const rows = [order(), order({ origin: "waiter-app", fulfillment: "DELIVERY", businessDate: "2026-11-25" }),
      order({ origin: "whatsapp", fulfillment: "DELIVERY", businessDate: "2026-11-24" })];
    expect(resumirPedidosRecebidos(rows, { origem: "waiter-app" }).datas).toBe(2);
    expect(resumirPedidosRecebidos(rows, { modalidade: "DELIVERY" }).pedidos).toBe(2);
    expect(resumirPedidosRecebidos(rows, { origem: "waiter-app", modalidade: "DELIVERY" }).pedidos).toBe(1);
    expect(resumirPedidosRecebidos(rows, { origem: "whatsapp", modalidade: "LOCAL" }).setores).toEqual([]);
  });
  it("agrupa canais desconhecidos sob um filtro específico sem somar tip nem frete", () => {
    const r = resumirPedidosRecebidos([order({ origin: "unknown", fulfillment: null, freightCents: 430 })],
      { origem: "nao-identificado", modalidade: "nao-identificado" });
    expect(r.pedidos).toBe(1);
    expect(r.setores.reduce((n, x) => n + x.centavos, 0)).toBe(2300);
  });
  it("não apresenta zero fictício e inclui zero apenas quando dado comprovado alocado", () => {
    expect(resumirPedidosRecebidos([]).setores).toEqual([]);
    const sem = resumirPedidosRecebidos([order({ allocated: [] })]);
    expect(sem.setores).toEqual([]);
    expect(sem.pendentes).toBe(200);
    const zero = resumirPedidosRecebidos([order({ allocated: [{ sectorId: "bar", cents: 0 }], pending: [] })]);
    expect(zero.setores).toEqual([{ sectorId: "bar", centavos: 0, pedidos: 1 }]);
  });
});
