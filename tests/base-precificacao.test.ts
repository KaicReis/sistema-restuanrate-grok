import { expect, it } from "vitest";
import { basePrecificacaoSchema, dnaParaPrecificacao, sugerirBasePrecificacao } from "../src/lib/base-precificacao";
import { calcularPrecoDNA, entradaPreco } from "../src/lib/dna";
import { demonstrativo } from "../src/lib/financeiro";
import { mesclarDados } from "../src/lib/import-data";
import { validarBackup } from "../src/lib/storage";
import { criarBase, novoDNA, novosCanais } from "../src/lib/storage/seed";
import { dnaComRateio, rateioAluguel } from "../src/lib/v2";
import type { Insumo, Produto } from "../src/lib/types";

const zero = { pedidos: 0, subtotal: 0, frete: 0, total: 0 };
const real = (competencia: string, subtotal: number, periodoAte?: string) => ({
  competencia, periodoAte, pedidosExportados: 1, salaoDesde: `${competencia}-01`,
  canais: { salao: { pedidos: 1, subtotal, frete: 0, total: subtotal }, retirada: zero, delivery: zero },
});
const estimado = (competencia: string, valor: number, restaurante_id = "bar") => ({
  competencia, unidadesNoArquivo: 5, setores: [{ valor, restaurante_id, unidades: 5 }],
});

it("usa meses fechados do mesmo ano e operação, prefere realizados e substitui pela menor base válida", () => {
  const db = criarBase();
  db.fechamentosFinanceiros = [{ restaurante_id: "bar", competencia: "2026-01", receitaBruta: 12_000, descontos: 1_000, estornos: 1_000 }];
  db.vendasAnotai = [real("2026-03", 9_000, "2026-03-10"), real("2026-04", 7_000)];
  db.vendasSetorCanal = db.vendasAnotai.map(({ competencia, periodoAte, canais }) => ({
    competencia, periodoAte, linhas: [{ restaurante_id: "bar", canal: "salao", subtotal: canais.salao.subtotal }],
  }));
  db.vendasSetoresEstimadas = [
    estimado("2026-01", 20_000), estimado("2026-02", 8_000),
    { ...estimado("2026-03", 1_000), relatorioParcial: true },
    estimado("2026-03", 2, "bora"), estimado("2025-08", 3),
    estimado("2026-05", 3), estimado("2026-06", 4),
  ].filter((mes) => mes.setores[0].restaurante_id === "bar");
  expect(sugerirBasePrecificacao(db, "bar", 2026, "2026-05")).toEqual({
    ano: 2026, menorMes: "2026-04", valor: 8000,
    meses: [
      { competencia: "2026-01", valor: 10000, fonte: "dre" },
      { competencia: "2026-02", valor: 8000, fonte: "estimativa_cobertura" },
      { competencia: "2026-03", valor: 7000, fonte: "substituido" },
      { competencia: "2026-04", valor: 7000, fonte: "anotai" },
    ],
  });
  expect(sugerirBasePrecificacao(db, "bora", 2026, "2026-05")).toMatchObject({ valor: 0, menorMes: "2026-04" });
  expect(sugerirBasePrecificacao(db, "bar", 2025, "2026-05")?.meses.length).toBe(12);
  expect(sugerirBasePrecificacao(db, "bar", 2025, "2026-05")?.meses[7].fonte).toBe("estimativa_cobertura");
  expect(sugerirBasePrecificacao(db, "bar", 2027, "2026-05")).toBeNull();
});

it("não conta meta, histórico demonstrativo ou estimativa com itens não classificados como mês completo", () => {
  const db = criarBase();
  db.dnas = [
    { ...novoDNA("bar", "2026-01"), faturamento: 8000 },
    { ...novoDNA("bar", "2026-02"), faturamento: 9000, tipoFaturamento: "realizado", historico: true },
  ];
  db.vendasSetoresEstimadas = [{ ...estimado("2026-03", 900), unidadesNoArquivo: 10 }];
  expect(sugerirBasePrecificacao(db, "bar", 2026, "2026-04")).toBeNull();
  db.dnas.push({ ...novoDNA("bar", "2026-01"), faturamento: 12_345, tipoFaturamento: "realizado" });
  expect(sugerirBasePrecificacao(db, "bar", 2026, "2026-04")).toMatchObject({ valor: 12_345, menorMes: "2026-01" });
});

it("preserva zero realizado e a memória da base aprovada sem recalcular depois", () => {
  const db = criarBase();
  db.fechamentosFinanceiros = [
    { restaurante_id: "bar", competencia: "2026-01", receitaBruta: 0, descontos: 0, estornos: 0 },
    { restaurante_id: "bar", competencia: "2026-02", receitaBruta: 30_000, descontos: 0, estornos: 0 },
  ];
  const proposta = sugerirBasePrecificacao(db, "bar", 2026, "2026-04")!;
  expect(proposta.valor).toBe(10_000);
  const base = basePrecificacaoSchema.parse({ ...proposta, modo: "media", restaurante_id: "bar" });
  db.basesPrecificacao = [base];
  db.fechamentosFinanceiros[1].receitaBruta = 150_000;
  const restaurado = validarBackup(JSON.parse(JSON.stringify(mesclarDados(db, criarBase()))));
  expect(dnaParaPrecificacao(restaurado, novoDNA("bar", "2027-05")).faturamento).toBe(10_000);
  expect(dnaParaPrecificacao(restaurado, novoDNA("bora", "2027-05")).faturamento).toBe(0);
  expect(basePrecificacaoSchema.safeParse({ ...base, valor: 550 }).success).toBe(false);
});

it("troca apenas o denominador de preços e não altera ficha, DRE, DNA nem rateio", () => {
  const db = criarBase();
  const mes = "2026-01";
  db.dnas = [{ ...novoDNA("bar", mes), faturamento: 10_000, tipoFaturamento: "realizado", fixos: [
    { id: "despesa", categoria: "Operação", descricao: "Despesa", natureza: "operacional", valor: 900 },
  ] }];
  db.alugueis = [{ competencia: mes, valor: 1000, regra: "fixo", percentuais: { bar: 100 } }];
  db.fechamentosFinanceiros = [{ restaurante_id: "bar", competencia: mes, receitaBruta: 12_000, descontos: 1_000, estornos: 1_000 }];
  const canal = novosCanais("bar", mes)[0];
  const insumo: Insumo = { id: "i", restaurante_id: "bar", nome: "Item", unidade: "g", quantidade: 1000, preco: 1500, rendimento: 100 };
  const produto: Produto = { id: "p", restaurante_id: "bar", nome: "Produto", rendimento: 1, itens: [{ insumo_id: "i", quantidade: 100, perda: 0 }], embalagem: 0 };
  const dre = demonstrativo(db, mes, "bar");
  const rateio = rateioAluguel(db, mes);
  const antes = entradaPreco(dnaComRateio(db, "bar", mes), canal, produto, [insumo]);
  db.basesPrecificacao = [{ restaurante_id: "bar", modo: "manual", valor: 20_000 }];
  const depois = entradaPreco(dnaParaPrecificacao(db, dnaComRateio(db, "bar", mes)), canal, produto, [insumo]);
  expect(depois).toEqual({ ...antes, faturamentoReferencia: 20_000 });
  expect(calcularPrecoDNA(depois)).not.toEqual(calcularPrecoDNA(antes));
  expect(demonstrativo(db, mes, "bar")).toEqual(dre);
  expect(rateioAluguel(db, mes)).toEqual(rateio);
  expect(db.dnas[0].faturamento).toBe(10_000);
});
