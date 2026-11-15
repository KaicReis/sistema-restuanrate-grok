import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
it.each(["db:migrate", "user:create"])(
  "%s inicia em CJS sem top-level await",
  (script) => {
    const result = spawnSync("npm", ["run", script], {
      encoding: "utf8",
      input: "",
      env: { ...process.env, DATABASE_URL: "" },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Configure DATABASE_URL");
    expect(result.stderr).not.toContain("Top-level await");
  },
);
