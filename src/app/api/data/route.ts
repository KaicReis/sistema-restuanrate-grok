import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { database } from "@/lib/server/db";
import { workspaces, snapshots } from "@/lib/server/schema";
import { currentUser, sameOrigin } from "@/lib/server/auth";
import { validarBackup } from "@/lib/storage";
export const runtime = "nodejs";
export async function GET() {
  if (!(await currentUser())) return new Response(null, { status: 401 });
  const [row] = await database()
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, "vila"));
  return NextResponse.json(row ?? { data: null, revision: 0 }, {
    headers: { "Cache-Control": "no-store" },
  });
}
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  if (!(await currentUser())) return new Response(null, { status: 401 });
  try {
    const raw = await request.text();
    if (raw.length > 10 * 1024 * 1024)
      return new Response(null, { status: 413 });
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
      await tx.insert(snapshots).values({ id: crypto.randomUUID(), data });
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
