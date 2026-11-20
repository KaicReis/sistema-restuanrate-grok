import { expect, it } from "vitest";
import { insumoArquivado } from "../src/lib/insumos";
import { sugerirInsumo } from "../src/lib/purchases";
import { criarBase } from "../src/lib/storage/seed";
import type { Insumo } from "../src/lib/types";

it("mantém o salmão no sushi e ignora o cadastro indevido do Bora em compras", () => {
  const db = criarBase();
  const sushi = db.insumos.find((i) => i.id === "seed-nativos-i0")!;
  expect(sushi).toBeDefined();
  expect(db.insumos.some((i) => i.id === "seed-bora-i0")).toBe(false);
  const antigo: Insumo = { ...sushi, id: "seed-bora-i0", restaurante_id: "bora" };
  db.insumos.push(antigo);
  expect(insumoArquivado(antigo)).toBe(true);
  expect(insumoArquivado(sushi)).toBe(false);
  expect(sugerirInsumo(db, "bora", "Salmão")).toBeUndefined();
  expect(sugerirInsumo(db, "nativos", "Salmão")).toBe(sushi.id);
});
