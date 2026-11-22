import { describe, expect, it } from "vitest";
import { montarRelatorio } from "../src/lib/relatorios";
import { historicoInsumo } from "../src/lib/relatorio-insumos";
import { novoDNA } from "../src/lib/storage/seed";
import type { Database } from "../src/lib/types";

const mes = "2026-01";

function base(): Database {
  return {
    version: 2,
    restaurantes: [
      { id: "a-vila", nome: "A Vila", regime: "Simples", grupo: true },
      { id: "bora", nome: "Bora", regime: "Simples" },
      { id: "sushi", nome: "Sushi", regime: "Simples" },
    ],
    dnas: [], canais: [], insumos: [], produtos: [], receitas: [], alugueis: [], precos: [],
  };
}

describe("relatórios da Vila", () => {
  it("soma fixos operacionais e aluguel uma vez, inclusive nas categorias", () => {
    const db = base();
    db.alugueis = [{ competencia: mes, valor: 700000, regra: "fixo", percentuais: { bora: 50, sushi: 50 } }];
    db.dnas = ["bora", "sushi"].map((id) => ({
      ...novoDNA(id, mes),
      fixos: [
        { id: "limpeza", categoria: id === "bora" ? "Limpeza" : "limpeza", descricao: "Limpeza rateada", valor: 8655, natureza: "operacional" },
        { id: "amort", categoria: "Equipamentos", descricao: "Amortização", valor: 400, natureza: "amortizacao" },
      ],
    }));
    const relatorio = montarRelatorio(db, mes, "a-vila", 3);
    expect(relatorio.atual.fixos).toBe(717310);
    expect(relatorio.categorias).toEqual([
      { nome: "Aluguel", valor: 700000 }, { nome: "Limpeza", valor: 17310 },
    ]);
    expect(relatorio.serie.map((r) => r.mes)).toEqual(["2025-11", "2025-12", mes]);
    expect(relatorio.serie[0].fixos).toBeNull();
    expect(montarRelatorio(db, mes, "bora", 3).atual.fixos).toBe(358655);
  });

  it("mantém aluguel sem rateio no total do grupo e fora dos totais dos setores", () => {
    const db = base();
    db.alugueis = [{ competencia: mes, valor: 12500, regra: "faturamento", percentuais: {} }];
    const grupo = montarRelatorio(db, mes, "a-vila", 3);
    expect(grupo.atual).toMatchObject({ fixos: 12500, aluguelSemRateio: 12500 });
    expect(grupo.categorias).toEqual([{ nome: "Aluguel sem rateio", valor: 12500 }]);
    expect(grupo.setores.map((r) => r.fixos)).toEqual([null, null]);
  });

  it("separa compras registradas do DRE, conserva zeros e sinaliza fechamento incompleto", () => {
    const db = base();
    db.insumos = [{
      id: "batata", restaurante_id: "sushi", nome: "Batata", unidade: "kg",
      quantidade: 1, preco: 1800, rendimento: 100,
      historicoPrecos: { [mes]: { unidade: "kg", quantidade: 1, preco: 1800, rendimento: 100 } },
    }];
    db.compras = [{
      id: "nota", restaurante_id: "bora", fornecedor: "Fornecedor", data: mes + "-11",
      totalNota: 34.19, itens: [{ nome: "Item", unidade: "un", quantidade: 1, valorUnitario: 34.19, total: 34.19 }],
    }];
    db.dnas = [{ ...novoDNA("bora", mes), cmvReal: 0, variaveisReais: 0 }];
    db.fechamentosFinanceiros = [{
      restaurante_id: "bora", competencia: mes, receitaBruta: 0, descontos: 0,
      estornos: 0, impostos: 0, fixos: 250,
    }];
    const vila = montarRelatorio(db, mes, "a-vila", 6);
    expect(vila.atual).toMatchObject({
      compras: 3419, resultado: null, quantidadeCompras: 1,
      setoresFechados: 1, setoresTotal: 2,
    });
    expect(vila.fornecedores).toEqual([{ nome: "Fornecedor", valor: 3419, quantidade: 1 }]);
    expect(vila.setores.map((r) => r.compras)).toEqual([3419, null]);
    expect(montarRelatorio(db, mes, "bora", 3).atual).toMatchObject({
      compras: 3419, resultado: -250, cmv: 0, receita: 0,
    });
  });
});

it("compara preços de insumos pela mesma unidade de compra e preserva meses sem lançamento", () => {
  const insumo = {
    id: "insumo", restaurante_id: "bora", nome: "Batata", unidade: "kg" as const,
    quantidade: 15, preco: 31500, rendimento: 100,
    historicoPrecos: {
      "0000-01": { unidade: "kg" as const, quantidade: 1, preco: 1900, rendimento: 100 },
      "2025-09": { unidade: "g" as const, quantidade: 15000, preco: 30000, rendimento: 100 },
      "2025-12": { unidade: "kg" as const, quantidade: 15, preco: 31500, rendimento: 100 },
      [mes]: { unidade: "un" as const, quantidade: 1, preco: 32000, rendimento: 100 },
    },
  };
  const anterior = historicoInsumo(insumo, "2025-12");
  expect(anterior.historico.map(({ competencia }) => competencia)).toEqual(["2025-12", "2025-09"]);
  expect(anterior.variacao).toBeCloseTo(0.05);
  expect(historicoInsumo(insumo, mes).variacao).toBeNull();
});
