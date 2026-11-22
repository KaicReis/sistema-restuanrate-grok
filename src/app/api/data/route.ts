import { NextResponse } from "next/server";
import { and, eq, lt } from "drizzle-orm";
import { database } from "@/lib/server/db";
import { workspaces, snapshots } from "@/lib/server/schema";
import { currentUser, sameOrigin } from "@/lib/server/auth";
import { validarBackup } from "@/lib/storage";
import { compactarBackup, LIMITE_BYTES_SINCRONIZACAO } from "@/lib/historico-importacoes";
export const runtime = "nodejs";
const SNAPSHOTS_RECENTES = 20;
export async function GET(request: Request) {
  if (!(await currentUser())) return new Response(null, { status: 401 });
  const headers = { "Cache-Control": "no-store" };
  if (new URL(request.url).searchParams.get("meta") === "1") {
    const [row] = await database()
      .select({ revision: workspaces.revision })
      .from(workspaces)
      .where(eq(workspaces.id, "vila"));
    return NextResponse.json({ revision: row?.revision ?? 0 }, { headers });
  }
  const [row] = await database()
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, "vila"));
  return NextResponse.json(
    row ? { ...row, data: compactarBackup(row.data) } : { data: null, revision: 0 },
    { headers },
  );
}
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  if (!(await currentUser())) return new Response(null, { status: 401 });
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > LIMITE_BYTES_SINCRONIZACAO)
      return NextResponse.json({ error: "A sincronização aceita até 4 MB por gravação." }, { status: 413 });
    const body = JSON.parse(raw),
      data = validarBackup(body.data),
      revision = body.revision;
    if (!Number.isSafeInteger(revision) || revision < 0)
      throw new Error("Revisão inválida");
    const result = await database().transaction(async (tx) => {
      let rows;
      if (revision === 0)
        rows = await tx
          .insert(workspaces)
          .values({ id: "vila", data, revision: 1 })
          .onConflictDoNothing()
          .returning();
      else
        rows = await tx
          .update(workspaces)
          .set({ data, revision: revision + 1 })
          .where(
            and(eq(workspaces.id, "vila"), eq(workspaces.revision, revision)),
          )
          .returning();
      if (!rows.length) return null;
      await tx.insert(snapshots).values({ id: crypto.randomUUID(), data, revision: rows[0].revision });
      // A gravação da revisão bloqueia a linha de workspaces até o fim da transação.
      // As cópias antigas sem revisão continuam disponíveis para uma exportação controlada.
      await tx.delete(snapshots).where(lt(snapshots.revision, rows[0].revision - SNAPSHOTS_RECENTES + 1));
      return rows[0];
    });
    if (!result)
      return NextResponse.json(
        {
          error:
            "Outro dispositivo alterou os dados. Exporte seu backup local e recarregue para conciliar.",
        },
        { status: 409 },
      );
    return NextResponse.json({ revision: result.revision });
  } catch {
    return NextResponse.json(
      {
        error:
          "Dados inválidos ou banco indisponível. A cópia local foi preservada.",
      },
      { status: 400 },
    );
  }
}
