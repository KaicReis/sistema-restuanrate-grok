import { describe, expect, it } from "vitest";
import { baseEquilibrio, calcularEquilibrio, demonstrativo } from "../src/lib/financeiro";
import { novoDNA } from "../src/lib/storage/seed";
import type { Database } from "../src/lib/types";

const mes = "2026-11";
function base(): Database {
  return {
    version: 2,
    restaurantes: [
      { id: "a-vila", nome: "A Vila", regime: "Simples" },
      { id: "bora", nome: "Bora", regime: "Simples" },
      { id: "nativos", nome: "Nativos", regime: "Simples" },
    ],
    dnas: [
      { ...novoDNA("bora", mes), faturamento: 1_000_000, cmvReal: 300_000, variaveisReais: 100_000 },
      { ...novoDNA("nativos", mes), faturamento: 500_000, cmvReal: 100_000, variaveisReais: 50_000 },
    ],
    fechamentosFinanceiros: [
      { restaurante_id: "bora", competencia: mes, receitaBruta: 1_050_000, descontos: 20_000, estornos: 30_000, impostos: 100_000, fixos: 175_000 },
      { restaurante_id: "nativos", competencia: mes, receitaBruta: 500_000, descontos: 0, estornos: 0, impostos: 50_000, fixos: 75_000 },
    ],
    alugueis: [{ competencia: mes, valor: 75_000, regra: "faturamento", percentuais: {} }],
    canais: [],
    insumos: [],
    produtos: [],
    precos: [],
  };
}

describe("Financeiro", () => {
  it("consolida a receita depois dos abatimentos e conta o aluguel uma vez", () => {
    const db = base();
    expect(demonstrativo(db, mes, "bora")).toMatchObject({
      receita: 1_000_000, contribuicao: 500_000, fixos: 175_000,
      aluguel: 50_000, resultado: 275_000, margem: 0.275,
    });
    expect(demonstrativo(db, mes, "a-vila")).toMatchObject({
      receita: 1_500_000, fixos: 250_000, aluguel: 75_000, resultado: 475_000,
    });
  });

  it("mantém dados faltantes pendentes sem substituir o realizado pela alíquota do DNA", () => {
    const db = base();
    db.fechamentosFinanceiros![0].impostos = undefined;
    expect(demonstrativo(db, mes, "a-vila")).toMatchObject({
      impostos: null, contribuicao: null, resultado: null,
    });
    expect(baseEquilibrio(db, mes, "bora")).toMatchObject({
      receitaReal: 1_000_000, fonteFixos: "realizado", fonteAliquotas: "dna",
      aliquotas: { cmv: 0.3, variaveis: 0.1, impostos: 0.1 },
    });
  });

  it("inclui aluguel ainda sem rateio apenas no consolidado", () => {
    const db = base();
    db.dnas.forEach((dna) => { dna.faturamento = 0; });
    expect(demonstrativo(db, mes, "bora").resultado).toBeNull();
    expect(demonstrativo(db, mes, "bora").aluguel).toBeNull();
    expect(demonstrativo(db, mes, "a-vila").resultado).toBe(475_000);
  });

  it("calcula a meta em centavos e não divide por zero dias nem margem não positiva", () => {
    expect(calcularEquilibrio(225_000, 0.5, 300_000, 11)).toEqual({
      ponto: 450_000, falta: 150_000, porDia: 13_637,
    });
    expect(calcularEquilibrio(300_000, 0.7 - 0.2, 700_000, 0)).toEqual({
      ponto: 600_000, falta: 0, porDia: null,
    });
    expect(calcularEquilibrio(300_000, 0, 700_000, 12)).toEqual({
      ponto: null, falta: null, porDia: null,
    });
  });
});
