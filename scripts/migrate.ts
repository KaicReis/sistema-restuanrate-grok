import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Configure DATABASE_URL");
  const client = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
  try {
    await migrate(drizzle(client), { migrationsFolder: "./migrations" });
    console.log("Migrações aplicadas.");
  } finally {
    await client.end();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
