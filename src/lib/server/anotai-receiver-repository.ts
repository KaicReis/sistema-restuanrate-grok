import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { database } from "@/lib/server/db";
import { workspaces } from "@/lib/server/schema";
import { anotaiPedidosRecebidos } from "@/lib/server/anotai-pedidos-schema";
import type { ReceiverStore } from "@/lib/anotai-receiver-http";

export const anotaiReceiverStore: ReceiverStore = {
  async readMonth(month) {
    const data = await database().select({ order: anotaiPedidosRecebidos.pedido }).from(anotaiPedidosRecebidos)
      .where(and(gte(anotaiPedidosRecebidos.data, month + "-01"), lte(anotaiPedidosRecebidos.data, month + "-31")))
      .orderBy(asc(anotaiPedidosRecebidos.data)).limit(10001);
    return data.map(d => d.order);
  },
  transaction(fn) {
    return database().transaction(async tx => {
      // Serializa reenvios concorrentes. Não escreve no snapshot de gestão.
      await tx.execute(sql`select pg_advisory_xact_lock(62175129)`);
      return fn({
        async catalog() {
          const [workspace] = await tx.select({ data: workspaces.data }).from(workspaces)
            .where(eq(workspaces.id, "vila")).for("share");
          if (!workspace) throw Error("Catálogo indisponível.");
          return { produtos: workspace.data.produtos, setores: workspace.data.restaurantes.filter(r => !r.grupo && r.id !== "a-vila") };
        },
        existing: keys => tx.select({ key: anotaiPedidosRecebidos.chave, digest: anotaiPedidosRecebidos.hash,
          order: anotaiPedidosRecebidos.pedido }).from(anotaiPedidosRecebidos).where(inArray(anotaiPedidosRecebidos.chave, keys)),
        async insert(rows) {
          await tx.insert(anotaiPedidosRecebidos).values(rows.map(r => ({
            chave: r.key, hash: r.digest, data: r.order.businessDate, pedido: r.order,
          })));
        },
      });
    });
  },
};
