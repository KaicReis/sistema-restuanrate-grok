import { randomBytes, scryptSync } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { users } from "../src/lib/server/schema";
async function main() {
  // A senha é lida do stdin: não é argumento de processo nem variável persistente na Vercel.
  const email = process.argv[2]?.trim().toLowerCase();
  let password = "";
  for await (const chunk of process.stdin) password += chunk;
  password = password.trim();
  if (
    !email ||
    !email.includes("@") ||
    password.length < 12 ||
    password.length > 256 ||
    !process.env.DATABASE_URL
  )
    throw new Error(
      "Uso: senha (stdin, 12–256 caracteres) | npm run user:create -- email [owner|staff]. Configure DATABASE_URL.",
    );
  const client = postgres(process.env.DATABASE_URL, { prepare: false });
  try {
    const salt = randomBytes(16).toString("hex");
    await drizzle(client)
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        email,
        passwordHash:
          salt + ":" + scryptSync(password, salt, 64).toString("hex"),
        role: process.argv[3] === "owner" ? "owner" : "staff",
      });
    console.log("Usuário criado.");
  } finally {
    await client.end();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
