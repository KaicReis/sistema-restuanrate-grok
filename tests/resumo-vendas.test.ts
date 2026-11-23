import { expect, it } from "vitest";
import { resumoVendas, selecionarLinhasVendas } from "../src/lib/resumo-vendas";
import type { VendaAnotaiMensal } from "../src/lib/vendas-anotai";
import type { Database } from "../src/lib/types";

const zero = { pedidos: 0, subtotal: 0, frete: 0, total: 0 };
const janeiro: VendaAnotaiMensal = {
  competencia: "2026-01",
  pedidosExportados: 2,
  canais: {
    salao: zero,
    delivery: { pedidos: 2, subtotal: 3200, frete: 600, total: 3800 },
    retirada: zero,
  },
};
const fevereiro: VendaAnotaiMensal = {
  competencia: "2026-02",
  periodoAte: "2026-02-12",
  salaoDesde: "2026-02-10",
  pedidosExportados: 3,
  canais: {
    salao: { pedidos: 1, subtotal: 2000, frete: 0, total: 2000 },
    delivery: { pedidos: 2, subtotal: 900, frete: 600, total: 1500 },
    retirada: zero,
  },
};
const base: Pick<Database, "vendasAnotai" | "vendasSetorCanal"> = {
  vendasAnotai: [janeiro, fevereiro],
  vendasSetorCanal: [{
    competencia: "2026-02",
    periodoAte: "2026-02-12",
    linhas: [
      { restaurante_id: "bar", canal: "salao", subtotal: 1250, pedidos: 1 },
      { restaurante_id: "bar", canal: "delivery", subtotal: 900, pedidos: 2 },
      { restaurante_id: "nativos", canal: "salao", subtotal: 750, pedidos: 1 },
    ],
  }],
};

it("não usa uma venda consolidada nem outro mês para preencher as vendas do Bar em janeiro", () => {
  expect(resumoVendas(base, "2026-01", "bar")).toMatchObject({ total: null });
  expect(resumoVendas(base, "2025-01", "bar")).toMatchObject({ total: null });
  expect(resumoVendas(base, "2025-01", "a-vila")).toMatchObject({ total: null });
  expect(resumoVendas(base, "2026-01", "a-vila")).toMatchObject({
    total: 3200,
    totalDetalhado: undefined,
    coberturaSalao: "ausente",
    parcial: true,
  });
});

it("mantém setor, mês, corte e cobertura alinhados entre cartão e detalhamento", () => {
  const fevereiroBar = resumoVendas(base, "2026-02", "bar");
  expect(fevereiroBar).toMatchObject({
    total: 2150, totalDetalhado: 2150, coberturaSalao: "parcial", periodoAte: "2026-02-12", parcial: true,
  });
  expect(resumoVendas(base, "2026-02", "a-vila").total).toBe(2900);
  const deliveryBar = selecionarLinhasVendas(fevereiroBar.registro!, "bar", ["delivery"], fevereiroBar.coberturaSalao);
  expect(deliveryBar.map((linha) => linha.subtotal)).toEqual([900]);
});

it("distingue zero apurado em uma matriz conciliada de mês sem detalhamento", () => {
  expect(resumoVendas(base, "2026-02", "bora").total).toBe(0);
  expect(resumoVendas(base, "2026-01", "bora").total).toBeNull();
});
