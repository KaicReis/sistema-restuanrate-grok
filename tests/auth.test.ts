import { it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  tokenHash,
} from "../src/lib/server/auth";
it("salga senhas e valida sem armazenar texto original", () => {
  const a = hashPassword("senha-segura-123"),
    b = hashPassword("senha-segura-123");
  expect(a).not.toBe(b);
  expect(a).not.toContain("senha");
  expect(verifyPassword("senha-segura-123", a)).toBe(true);
  expect(verifyPassword("errada", a)).toBe(false);
});
it("exige AUTH_SECRET forte para autenticar sessões", () => {
  const prev = process.env.AUTH_SECRET;
  try {
    process.env.AUTH_SECRET = "curto";
    expect(() => tokenHash("token")).toThrow();
    process.env.AUTH_SECRET = "a".repeat(32);
    expect(tokenHash("token")).toHaveLength(64);
  } finally {
    if (prev === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = prev;
  }
});
