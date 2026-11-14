import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { database } from "@/lib/server/db";
import { users, sessions, attempts } from "@/lib/server/schema";
import {
  currentUser,
  sameOrigin,
  tokenHash,
  verifyPassword,
} from "@/lib/server/auth";
export const runtime = "nodejs";
export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json({ mode: "local" });
  try {
    return NextResponse.json({ mode: "cloud", user: await currentUser() });
  } catch {
    return NextResponse.json(
      {
        error:
          "Banco ou AUTH_SECRET indisponível. Verifique a configuração e as migrações.",
      },
      { status: 503 },
    );
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  try {
    const body = await request.json();
    const email = String(body.email ?? "")
        .trim()
        .toLowerCase(),
      password = String(body.password ?? "");
    if (email.length > 254 || password.length > 256)
      return new Response(null, { status: 400 });
    const db = database(),
      key = tokenHash(email);
    const [limit] = await db
      .insert(attempts)
      .values({ key, count: 1, expires: new Date(Date.now() + 900000) })
      .onConflictDoUpdate({
        target: attempts.key,
        set: {
          count: sql`CASE WHEN ${attempts.expires} < now() THEN 1 ELSE ${attempts.count}+1 END`,
          expires: sql`CASE WHEN ${attempts.expires} < now() THEN now()+interval '15 minutes' ELSE ${attempts.expires} END`,
        },
      })
      .returning();
    if (limit.count > 10)
      return NextResponse.json(
        { error: "Muitas tentativas. Aguarde 15 minutos." },
        { status: 429 },
      );
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user || !verifyPassword(password, user.passwordHash))
      return NextResponse.json(
        { error: "E-mail ou senha inválidos." },
        { status: 401 },
      );
    const token = randomBytes(32).toString("hex"),
      expires = new Date(Date.now() + 7 * 86400000);
    await db
      .insert(sessions)
      .values({ token: tokenHash(token), userId: user.id, expires });
    const response = NextResponse.json({ ok: true });
    response.cookies.set("vila-session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires,
    });
    return response;
  } catch {
    return NextResponse.json(
      { error: "Não foi possível entrar. Confira o banco e AUTH_SECRET." },
      { status: 503 },
    );
  }
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  const token = request.headers
    .get("cookie")
    ?.match(/(?:^|; )vila-session=([^;]+)/)?.[1];
  if (token)
    await database()
      .delete(sessions)
      .where(eq(sessions.token, tokenHash(token)));
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("vila-session");
  return res;
}
