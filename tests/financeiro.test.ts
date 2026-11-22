import { describe, expect, it } from "vitest";
import { baseEquilibrio, calcularEquilibrio, demonstrativo } from "../src/lib/financeiro";
import { novoDNA } from "../src/lib/storage/seed";
import { consolidar } from "../src/lib/v2";
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

  it("rateia pelo DRE realizado mesmo se a meta no DNA for zero", () => {
    const db = base();
    db.dnas.forEach((dna) => { dna.faturamento = 0; });
    expect(demonstrativo(db, mes, "bora")).toMatchObject({ aluguel: 50_000, resultado: 275_000 });
    expect(demonstrativo(db, mes, "a-vila").resultado).toBe(475_000);
  });

  it("rateia R$ 7.000 em quatro parcelas de R$ 1.750, sem aluguel de Vinhos", () => {
    const db = base();
    db.restaurantes.push(
      { id: "bar", nome: "Bar", regime: "Simples" },
      { id: "marias", nome: "Maria’s", regime: "Simples" },
      { id: "vinhos", nome: "Carta de Vinhos", regime: "Simples" },
    );
    db.fechamentosFinanceiros = [];
    db.alugueis = [{
      competencia: mes, valor: 700_000, regra: "fixo",
      percentuais: { nativos: 25, bora: 25, bar: 25, marias: 25 },
    }];
    for (const id of ["nativos", "bora", "bar", "marias"]) {
      expect(demonstrativo(db, mes, id)).toMatchObject({ aluguel: 175_000, aluguelProvisorio: false });
    }
    expect(demonstrativo(db, mes, "vinhos").aluguel).toBe(0);
    expect(demonstrativo(db, mes, "a-vila").aluguel).toBe(700_000);
  });

  it("usa o mesmo resultado e margem no DRE e na visão da Vila", () => {
    const db = base();
    const dre = demonstrativo(db, mes, "a-vila");
    expect(consolidar(db, mes)).toMatchObject({
      receita: dre.receita, cmv: dre.cmv, lucro: dre.resultado, margem: dre.margem,
    });
  });

  it("usa a receita consolidada sem repetir abatimentos quando o DRE setorial está incompleto", () => {
    const db = base();
    db.faturamentosConsolidados = [{
      competencia: mes, valor: 1_600_000, fonte: "anotai", coberturaSalao: "integral",
    }];
    expect(demonstrativo(db, mes, "a-vila")).toMatchObject({ receita: 1_500_000, fonteReceita: "dre" });
    delete db.fechamentosFinanceiros![1].receitaBruta;
    expect(demonstrativo(db, mes, "a-vila")).toMatchObject({
      receita: 1_600_000, fonteReceita: "anotai", descontos: 20_000, estornos: 30_000,
      resultado: 575_000,
    });
    expect(demonstrativo(db, mes, "nativos").receita).toBeNull();
    db.faturamentosConsolidados[0].coberturaSalao = "ausente";
    expect(demonstrativo(db, mes, "a-vila")).toMatchObject({
      receita: 1_600_000, receitaParcial: true, resultado: null, margem: null,
    });
    db.faturamentosConsolidados[0].coberturaSalao = "integral";
    db.faturamentosConsolidados[0].periodoAte = "2026-11-21";
    expect(demonstrativo(db, mes, "a-vila")).toMatchObject({
      receita: 1_600_000, receitaParcial: true, resultado: null, margem: null,
    });
    expect(baseEquilibrio(db, mes, "a-vila").receitaReal).toBeNull();
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
