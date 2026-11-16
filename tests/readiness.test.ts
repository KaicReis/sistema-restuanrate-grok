import { describe, expect, it } from "vitest";
import { preparoPendente } from "../src/components/readiness";
import { criarBase } from "../src/lib/storage/seed";
import type { Produto } from "../src/lib/types";

describe("filtros de pendências", () => {
  it("usa o custo da competência e identifica preços e quantidades pendentes", () => {
    const db = criarBase();
    db.insumos.push({
      id: "farinha",
      restaurante_id: "bora",
      nome: "Farinha",
      quantidade: 1,
      unidade: "kg",
      rendimento: 100,
      preco: 1000,
      historicoPrecos: {
        "2026-10": {
          preco: 0,
          precoPendente: true,
          quantidade: 1,
          unidade: "kg",
          rendimento: 100,
        },
        "2026-11": {
          preco: 1000,
          quantidade: 1,
          unidade: "kg",
          rendimento: 100,
        },
      },
    });
    const produto: Produto = {
      id: "pao",
      restaurante_id: "bora",
      nome: "Pão",
      rendimento: 1,
      embalagem: 0,
      itens: [{ insumo_id: "farinha", quantidade: 100, perda: 0 }],
    };
    expect(preparoPendente(db, "2026-10", produto)).toBe(true);
    expect(preparoPendente(db, "2026-11", produto)).toBe(false);
    expect(
      preparoPendente(db, "2026-11", {
        ...produto,
        itens: [{ ...produto.itens[0], confirmar: true }],
      }),
    ).toBe(true);
    expect(preparoPendente(db, "2026-11", { ...produto, pendente: true })).toBe(
      true,
    );
    expect(preparoPendente(db, "2026-11", { ...produto, itens: [] })).toBe(
      true,
    );
  });
});
