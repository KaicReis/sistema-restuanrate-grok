import { createHash, timingSafeEqual } from "node:crypto";
import { conciliarPedidos, prepararPedidos, receiverConfig } from "./anotai-receiver";
import { lerCorpo, resposta, type ReceiverStore } from "./anotai-receiver-http";

const hexSha256 = /^[a-f0-9]{64}$/;
const tokenPattern = /^Bearer ([A-Za-z0-9_-]{43,128})$/;
const datePattern = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;
const maxWindowMs = 2 * 60 * 60 * 1000;
type Env = Record<string, string | undefined>;

export function pilotConfig(env: Env, now = Date.now()) {
  const scope = receiverConfig(env);
  const expiry = env.ANOTAI_PILOT_EXPIRES_AT;
  const tokenHash = env.ANOTAI_PILOT_TOKEN_SHA256;
  const expectedKey = env.ANOTAI_PILOT_ORDER_KEY;
  if (!scope || env.ANOTAI_PILOT_ENABLED !== "true" ||
      (env.VERCEL_ENV === "production" && env.ANOTAI_PILOT_PRODUCTION_APPROVED !== "true") ||
      !expiry || !datePattern.test(expiry) || !tokenHash || !hexSha256.test(tokenHash) ||
      !expectedKey || !hexSha256.test(expectedKey)) return null;
  const end = Date.parse(expiry);
  if (!Number.isFinite(end) || new Date(end).toISOString().replace(".000Z", "Z") !== expiry || end <= now || end - now > maxWindowMs) return null;
  return { ...scope, end, tokenHash, expectedKey };
}
function credencialValida(sent: string | null, hash: string) {
  const token = sent && tokenPattern.exec(sent)?.[1];
  if (!token) return false;
  return timingSafeEqual(createHash("sha256").update(token, "ascii").digest(), Buffer.from(hash, "hex"));
}
export function criarPilotoAnotai(deps: Pick<ReceiverStore, "transaction"> & { env: Env; now?: () => number }) {
  const now = deps.now ?? Date.now;
  return async function POST(req: Request) {
    const cfg = pilotConfig(deps.env, now());
    if (!cfg || new URL(req.url).search || req.headers.has("origin") || req.headers.has("cookie")) {
      return resposta({ erro: "Piloto indisponível." }, 404);
    }
    if (!credencialValida(req.headers.get("authorization"), cfg.tokenHash)) {
      return resposta({ erro: "Credencial inválida para o piloto." }, 401);
    }
    let payload: unknown;
    try { payload = await lerCorpo(req); }
    catch { return resposta({ erro: "Envie o JSON sanitizado do coletor." }, 400); }
    try {
      return await deps.transaction(async tx => {
        if (now() >= cfg.end) return resposta({ erro: "Piloto encerrado." }, 404);
        const c = await tx.catalog();
        let rows;
        try { rows = prepararPedidos(payload, cfg.unitId, c.produtos, c.setores); }
        catch (e) { return resposta({ erro: (e as Error).message }, 422); }
        if (rows.length !== 1 || rows[0].key !== cfg.expectedKey) {
          return resposta({ erro: "Pedido fora do escopo autorizado." }, 403);
        }
        if (rows[0].order.pending.length || !rows[0].order.origin || rows[0].order.origin === "unknown" || !rows[0].order.fulfillment) {
          return resposta({ erro: "Pedido com classificação pendente; nada foi lançado." }, 422);
        }
        const existing = await tx.existing([cfg.expectedKey]);
        let result;
        try { result = conciliarPedidos(existing, rows); }
        catch (e) { return resposta({ erro: (e as Error).message }, 409); }
        if (now() >= cfg.end) return resposta({ erro: "Piloto encerrado." }, 404);
        if (result.fresh.length) await tx.insert(result.fresh);
        return resposta({ saved: result.fresh.length, existing: result.identical });
      });
    } catch { return resposta({ erro: "Não foi possível receber o pedido." }, 503); }
  };
}
