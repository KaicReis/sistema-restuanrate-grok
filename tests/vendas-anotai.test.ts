import { expect, it } from "vitest";
import { mesclarDados } from "../src/lib/import-data";
import { validarBackup } from "../src/lib/storage";
import { criarBase } from "../src/lib/storage/seed";
import {
  faturamentoAnotai,
  faturamentoConsolidadoNoMes,
  inicioSalaoAnotai,
  vendaAnotaiMensalSchema,
  vendasAnotaiSchema,
  type VendaAnotaiMensal,
} from "../src/lib/vendas-anotai";

const zero = { pedidos: 0, subtotal: 0, frete: 0, total: 0 };
const outubro: VendaAnotaiMensal = {
  competencia: "2026-10",
  canais: {
    delivery: { pedidos: 2, subtotal: 2_300, frete: 400, total: 2_700 },
    retirada: zero,
    salao: { pedidos: 1, subtotal: 1_200, frete: 0, total: 1_200 },
  },
  pedidosExportados: 4,
  salaoDesde: "2026-10-16",
};

it("preserva competências de vendas ao mesclar um backup e atualiza o mês recebido", () => {
  const base = criarBase();
  const setembro = { ...outubro, competencia: "2026-09", salaoDesde: undefined };
  const correcao = { ...outubro, pedidosExportados: 5, periodoAte: "2026-10-22" };
  const merged = mesclarDados(
    { ...base, vendasAnotai: [setembro, outubro] },
    { ...base, vendasAnotai: [correcao] },
  );
  expect(validarBackup(JSON.parse(JSON.stringify(merged))).vendasAnotai).toEqual([
    setembro,
    correcao,
  ]);
  expect(mesclarDados(merged, base).vendasAnotai).toEqual([setembro, correcao]);
});

it("rejeita divergências de valores, cobertura e competências duplicadas", () => {
  expect(vendaAnotaiMensalSchema.safeParse(outubro).success).toBe(true);
  expect(vendaAnotaiMensalSchema.safeParse({ ...outubro, salaoDesde: "2026-10-32" }).success).toBe(false);
  expect(vendaAnotaiMensalSchema.safeParse({ ...outubro, salaoDesde: "2026-11-01" }).success).toBe(false);
  expect(vendaAnotaiMensalSchema.safeParse({ ...outubro, periodoAte: "2026-10-32" }).success).toBe(false);
  expect(vendaAnotaiMensalSchema.safeParse({ ...outubro, periodoAte: "2026-11-01" }).success).toBe(false);
  expect(vendaAnotaiMensalSchema.safeParse({ ...outubro, pedidosExportados: 2 }).success).toBe(false);
  expect(vendaAnotaiMensalSchema.safeParse({
    ...outubro, canais: { ...outubro.canais, delivery: { ...outubro.canais.delivery, total: 2_800 } },
  }).success).toBe(false);
  expect(vendasAnotaiSchema.safeParse([outubro, outubro]).success).toBe(false);
});

it("registra subtotal sem frete e preserva a cobertura do salão e o corte do mês", () => {
  const setembro = { ...outubro, competencia: "2026-09", salaoDesde: undefined, canais: { ...outubro.canais, salao: zero } };
  const novembro = { ...outubro, competencia: "2026-11", salaoDesde: "2026-11-01", periodoAte: "2026-11-21" };
  const vendas = [setembro, outubro, novembro];
  const valores = vendas.map((venda) => faturamentoAnotai(venda, inicioSalaoAnotai(vendas)));
  expect(valores.map((valor) => [valor.valor, valor.coberturaSalao, valor.periodoAte])).toEqual([
    [2300, "ausente", undefined],
    [3500, "parcial", undefined],
    [3500, "integral", "2026-11-21"],
  ]);
  const base = criarBase();
  const merged = mesclarDados(
    { ...base, faturamentosConsolidados: valores.slice(0, 2) },
    { ...base, faturamentosConsolidados: valores.slice(2) },
  );
  expect(faturamentoConsolidadoNoMes(validarBackup(merged), "2026-11")).toEqual(valores[2]);
  expect(merged.faturamentosConsolidados).toEqual(valores);
});
