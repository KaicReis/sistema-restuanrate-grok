import { expect, it } from "vitest";
import { mesclarDados } from "../src/lib/import-data";
import { validarBackup } from "../src/lib/storage";
import { criarBase } from "../src/lib/storage/seed";
import {
  faturamentoAnotai,
  faturamentoConsolidadoNoMes,
  conferirPainelAnotai,
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

it("compara contagens e totais do painel sem misturar cancelados com o realizado", () => {
  const venda = vendaAnotaiMensalSchema.parse({
    ...outubro,
    pedidosExportados: 6,
    periodoAte: "2026-10-22",
    conferencia: {
      cancelados: { pedidos: 1, subtotal: 300, frete: 0, total: 300 },
      expirados: { pedidos: 1, subtotal: 600, frete: 100, total: 700 },
      rejeitados: { pedidos: 1, subtotal: 80, frete: 20, total: 100 },
      descontosInformativosSemRejeitados: 200,
      painel: { pedidos: 5, cancelados: 2, totalVendas: 5000, periodoDe: "2026-10-01", periodoAte: "2026-10-22" },
    },
  });
  expect(conferirPainelAnotai(venda)).toMatchObject({
    finalizados: { pedidos: 3, subtotal: 3500, frete: 400, total: 3900 },
    totalSemRejeitados: 4900,
    totalComDescontosRepostos: 5100,
    mesmasContagens: true,
    diferenca: 100,
  });
  expect(faturamentoAnotai(venda).valor).toBe(3500);
  expect(vendaAnotaiMensalSchema.safeParse({ ...venda, periodoAte: "2026-10-21" }).success).toBe(false);
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
