import { createHash } from "node:crypto";
import { classificadorProdutoSetor } from "./classificar-produto-setor";
import type { Produto, Restaurante } from "./types";

const origens = ["waiter-app", "qrcode", "pdv", "pdv-popup", "table-merged", "totem", "site", "whatsapp", "menu-share", "unknown"] as const;
const modalidades = ["LOCAL", "DELIVERY", "TAKE"] as const;
type Origem = (typeof origens)[number] | null;
type Modalidade = (typeof modalidades)[number] | null;
type Item = { productId: string | null; externalId: string | null; name: string; valueCents: number };
type Pedido = {
  source: "anotai"; unitId: string; orderId: string; businessDate: string; reference: string;
  status: "finalized"; origin: Origem; fulfillment: Modalidade; orderTotalCents: number;
  freightCents: number; tipCents: number; items: Item[];
};
export type PedidoRecebido = {
  businessDate: string; reference: string; origin: Origem; fulfillment: Modalidade;
  totalCents: number; merchandiseCents: number; freightCents: number; tipCents: number;
  allocated: { sectorId: string; cents: number }[];
  pending: { reason: string; cents: number; items: number }[];
};
export type RegistroRecebido = { key: string; digest: string; order: PedidoRecebido };

export const MAX_RECEIVER_BYTES = 256 * 1024;
const limiteMonetario = 100_000_000_00;
const objectId = /^[a-f0-9]{24}$/;
const idExterno = /^[a-z0-9._:/|-]{1,120}$/i;
const referencia = /^[0-9]{1,16}$/;
const iso = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const chave = (s: string) => createHash("sha256").update(s).digest("hex");
const lojaValida = (s: unknown): s is string => typeof s === "string" && objectId.test(s);
const dinheiro = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x >= 0 && x <= limiteMonetario;
const identificador = (x: unknown) => x === null || (typeof x === "string" && idExterno.test(x));
function dataValida(v: unknown): v is string {
  if (typeof v !== "string" || !iso.test(v)) return false;
  const d = new Date(v + "T00:00:00.000Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
function objeto(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Formato inválido.");
  const obj = value as Record<string, unknown>;
  if (required.some(k => !Object.hasOwn(obj, k)) || Object.keys(obj).some(k => !required.includes(k) && !optional.includes(k))) {
    throw new Error("O arquivo contém campos ausentes ou não permitidos.");
  }
  return obj;
}
export function receiverConfig(env: Record<string, string | undefined>) {
  const unitId = env.ANOTAI_RECEIVER_UNIT_ID?.toLowerCase();
  if (env.ANOTAI_RECEIVER_ENABLED !== "true" || !lojaValida(unitId)) return null;
  if (env.VERCEL_ENV === "preview" && env.ANOTAI_RECEIVER_PREVIEW_FIXTURES_ONLY === "true" && unitId === "aaaaaaaaaaaaaaaaaaaaaaaa") {
    return { unitId };
  }
  if (env.VERCEL_ENV === "production" && env.ANOTAI_RECEIVER_PRODUCTION_APPROVED === "true" && unitId !== "aaaaaaaaaaaaaaaaaaaaaaaa") {
    return { unitId };
  }
  return null;
}
function validar(value: unknown, loja: string): Pedido[] {
  const lote = objeto(value, ["orders"]);
  if (!Array.isArray(lote.orders) || lote.orders.length < 1 || lote.orders.length > 100) throw new Error("Envie de 1 a 100 pedidos por lote.");
  const ids = new Set<string>();
  return lote.orders.map(raw => {
    const r = objeto(raw, ["source", "unitId", "orderId", "businessDate", "reference", "status", "origin", "fulfillment",
      "orderTotalCents", "freightCents", "tipCents", "items"], ["merchandiseCents"]);
    if (r.source !== "anotai" || r.unitId !== loja || !lojaValida(r.orderId) || !dataValida(r.businessDate) ||
      typeof r.reference !== "string" || !referencia.test(r.reference) || r.status !== "finalized" ||
      !(r.origin === null || origens.includes(r.origin as NonNullable<Origem>)) ||
      !(r.fulfillment === null || modalidades.includes(r.fulfillment as NonNullable<Modalidade>)) ||
      !dinheiro(r.orderTotalCents) || !dinheiro(r.freightCents) || !dinheiro(r.tipCents)) {
      throw new Error("Pedido inválido ou de outra unidade.");
    }
    if (r.origin === "table-merged") throw new Error("Pedidos agrupados ainda não podem ser lançados.");
    if (r.tipCents > 0 && !(r.origin === "waiter-app" && r.fulfillment === "LOCAL")) {
      throw new Error("A gorjeta só está validada para pedidos de garçom com consumo local.");
    }
    if (!Array.isArray(r.items) || r.items.length < 1 || r.items.length > 100) throw new Error("Pedido sem itens verificáveis.");
    if (ids.has(r.orderId)) throw new Error("O mesmo pedido aparece mais de uma vez no lote.");
    ids.add(r.orderId);
    const items = r.items.map(rawItem => {
      const i = objeto(rawItem, ["name", "valueCents"], ["productId", "externalId", "quantity"]);
      if (!identificador(i.productId ?? null) || !identificador(i.externalId ?? null) ||
        typeof i.name !== "string" || !i.name.trim() || i.name.length > 120 ||
        /[\p{Cc}\p{Cf}]/u.test(i.name) || !dinheiro(i.valueCents) || (i.quantity !== undefined && (typeof i.quantity !== "number" || !Number.isSafeInteger(i.quantity) || i.quantity < 1 || i.quantity > 1000))) throw new Error("Item sem nome ou valor válido.");
      return { productId: (i.productId ?? null) as string | null, externalId: (i.externalId ?? null) as string | null,
        name: i.name.trim().normalize("NFC"), valueCents: i.valueCents };
    });
    const soma = items.reduce((n, i) => n + i.valueCents, 0);
    if ((r.merchandiseCents !== undefined && r.merchandiseCents !== soma) || soma + r.freightCents + r.tipCents !== r.orderTotalCents) {
      throw new Error("Itens, frete e gorjeta não conciliam com o total. Nenhum registro foi salvo.");
    }
    return { source: "anotai", unitId: loja, orderId: r.orderId as string, businessDate: r.businessDate as string,
      reference: r.reference as string, status: "finalized", origin: r.origin as Origem, fulfillment: r.fulfillment as Modalidade,
      orderTotalCents: r.orderTotalCents, freightCents: r.freightCents, tipCents: r.tipCents, items };
  });
}
export function prepararPedidos(
  payload: unknown, unitId: string, produtos: readonly Pick<Produto, "id" | "nome" | "restaurante_id">[],
  setores: readonly Pick<Restaurante, "id" | "nome">[],
): RegistroRecebido[] {
  const classificar = classificadorProdutoSetor(produtos, setores);
  return validar(payload, unitId).map(p => {
    const setorValores = new Map<string, number>();
    const pendencias = new Map<string, { cents: number; items: number }>();
    for (const item of p.items) {
      const resultado = classificar(item.name);
      if ("setor" in resultado) setorValores.set(resultado.setor, (setorValores.get(resultado.setor) ?? 0) + item.valueCents);
      else {
        const ant = pendencias.get(resultado.motivo) ?? { cents: 0, items: 0 };
        pendencias.set(resultado.motivo, { cents: ant.cents + item.valueCents, items: ant.items + 1 });
      }
    }
    const key = chave(p.source + ":" + p.unitId + ":" + p.orderId);
    const digest = chave(JSON.stringify({ ...p, items: p.items.map(i => JSON.stringify(i)).sort(), orderId: key, unitId: null }));
    return { key, digest, order: {
      businessDate: p.businessDate, reference: p.reference, origin: p.origin, fulfillment: p.fulfillment,
      totalCents: p.orderTotalCents, merchandiseCents: p.orderTotalCents - p.freightCents - p.tipCents,
      freightCents: p.freightCents, tipCents: p.tipCents,
      allocated: [...setorValores].map(([sectorId, cents]) => ({ sectorId, cents })).sort((a, b) => a.sectorId.localeCompare(b.sectorId)),
      pending: [...pendencias].map(([reason, info]) => ({ reason, ...info })).sort((a, b) => a.reason.localeCompare(b.reason)),
    }};
  });
}
export function conciliarPedidos(existing: readonly RegistroRecebido[], incoming: readonly RegistroRecebido[]) {
  const map = new Map(existing.map(record => [record.key, record]));
  let identical = 0;
  const fresh: RegistroRecebido[] = [];
  for (const next of incoming) {
    const stored = map.get(next.key);
    if (stored) {
      if (stored.digest !== next.digest) throw new Error("Um pedido já registrado tem dados diferentes. Nada foi alterado.");
      identical++;
    } else fresh.push(next);
  }
  return { identical, fresh };
}
export function reviewFingerprint(incoming: readonly RegistroRecebido[], identical: number) {
  return chave(JSON.stringify({ incoming: [...incoming].sort((a, b) => a.key.localeCompare(b.key)), identical }));
}
