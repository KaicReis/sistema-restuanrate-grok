import { MAX_RECEIVER_BYTES, prepararPedidos, conciliarPedidos, reviewFingerprint, receiverConfig,
  type PedidoRecebido, type RegistroRecebido } from "./anotai-receiver";
import type { Produto, Restaurante } from "./types";

type Catalog = { produtos: Pick<Produto, "id" | "nome" | "restaurante_id">[]; setores: Pick<Restaurante, "id" | "nome">[] };
export type ReviewTx = {
  catalog(): Promise<Catalog>;
  existing(keys: string[]): Promise<RegistroRecebido[]>;
  insert(rows: RegistroRecebido[]): Promise<void>;
};
export type ReceiverStore = {
  readMonth(month: string): Promise<PedidoRecebido[]>;
  transaction<T>(fn: (tx: ReviewTx) => Promise<T>): Promise<T>;
};
type Dependencies = ReceiverStore & {
  env: Record<string, string | undefined>;
  currentUser(): Promise<{ role: string } | null>;
  sameOrigin(request: Request): boolean;
};
export const resposta = (body: unknown, status = 200) => Response.json(body, { status, headers: {
  "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
} });
const mesValido = (mes: string | null): mes is string => !!mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);
export async function lerCorpo(req: Request) {
  if (!/^application\/json(?:;|$)/i.test(req.headers.get("content-type") ?? "") || !req.body) throw Error();
  const reader = req.body.getReader();
  let n = 0;
  const partes: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > MAX_RECEIVER_BYTES) { await reader.cancel(); throw Error(); }
    partes.push(value);
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(partes))) as unknown;
}
export function criarReceiverAnotai(deps: Dependencies) {
  async function autorizar() {
    const config = receiverConfig(deps.env);
    if (!config) return { erro: resposta({ erro: "Importação indisponível." }, 404) } as const;
    try {
      const user = await deps.currentUser();
      if (!user) return { erro: resposta({ erro: "Entre no Gestão para continuar." }, 401) } as const;
      if (user.role !== "owner") return { erro: resposta({ erro: "Disponível apenas para o responsável." }, 403) } as const;
    } catch { return { erro: resposta({ erro: "Não foi possível verificar o acesso." }, 503) } as const; }
    return { config } as const;
  }
  return {
    async GET(request: Request) {
      const auth = await autorizar();
      if (auth.erro) return auth.erro;
      const month = new URL(request.url).searchParams.get("mes");
      if (!mesValido(month)) return resposta({ erro: "Informe um mês válido." }, 400);
      try {
        const rows = await deps.readMonth(month);
        if (rows.length > 10000) return resposta({ erro: "Volume acima do limite de consulta." }, 422);
        return resposta({ rows });
      } catch { return resposta({ erro: "Não foi possível consultar os pedidos recebidos." }, 503); }
    },
    async POST(request: Request) {
      const auth = await autorizar();
      if (auth.erro) return auth.erro;
      if (!deps.sameOrigin(request)) return resposta({ erro: "Origem inválida." }, 403);
      let body: { action: "preview" | "commit"; payload: unknown; fingerprint?: string };
      try {
        const raw = await lerCorpo(request);
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error();
        const data = raw as Record<string, unknown>;
        if ((data.action !== "commit" && data.action !== "preview") ||
          !Object.hasOwn(data, "payload") || Object.keys(data).some(k => !["action", "payload", "fingerprint"].includes(k)) ||
          (data.action === "commit" && (typeof data.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(data.fingerprint))) ||
          (data.action === "preview" && Object.hasOwn(data, "fingerprint"))) throw Error();
        body = data as typeof body;
      } catch { return resposta({ erro: "Selecione um arquivo JSON do coletor de até 256 KB." }, 400); }
      try {
        return await deps.transaction(async tx => {
          const c = await tx.catalog();
          let rows;
          try { rows = prepararPedidos(body.payload, auth.config.unitId, c.produtos, c.setores); }
          catch (e) { return resposta({ erro: (e as Error).message }, 422); }
          const existing = await tx.existing(rows.map(r => r.key));
          let result;
          try { result = conciliarPedidos(existing, rows); }
          catch (e) { return resposta({ erro: (e as Error).message }, 409); }
          const fingerprint = reviewFingerprint(rows, result.identical);
          if (body.action === "preview") return resposta({
            fingerprint, alreadyReceived: result.identical, newCount: result.fresh.length,
            rows: result.fresh.map(r => r.order),
          });
          // Retentativa idêntica após sucesso é no-op, mesmo que o ACK anterior tenha se perdido.
          if (!result.fresh.length) return resposta({ saved: 0, existing: result.identical });
          if (fingerprint !== body.fingerprint) return resposta({ erro: "A conferência mudou. Revise o lote novamente." }, 409);
          await tx.insert(result.fresh);
          return resposta({ saved: result.fresh.length, existing: result.identical });
        });
      } catch { return resposta({ erro: "Não foi possível registrar o lote." }, 503); }
    },
  };
}
