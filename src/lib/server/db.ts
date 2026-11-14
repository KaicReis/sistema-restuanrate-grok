import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
let instance: ReturnType<typeof drizzle> | undefined;
export function database() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL ausente.");
  return (instance ??= drizzle(
    postgres(process.env.DATABASE_URL, { prepare: false, max: 3 }),
  ));
}
