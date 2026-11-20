import { describe, expect, it } from "vitest";
import { resumirFluxoCaixa, type MovimentoCaixa } from "@/lib/fluxo-caixa";
import { mesclarDados } from "@/lib/import-data";
import { validarBackup } from "@/lib/storage";
import { criarBase } from "@/lib/storage/seed";

const outubro = "2026-10";
const hoje = outubro + "-20";
const saldo = (restaurante_id: string, saldoCentavos: number) => ({
  restaurante_id,
  competencia: outubro,
  saldoCentavos,
});
const movimento = (
  atributos: Partial<MovimentoCaixa> = {},
): MovimentoCaixa => ({
  id: "m1",
  restaurante_id: "bora",
  data: outubro + "-10",
  descricao: "Recebimento da maquininha",
  tipo: "entrada",
  categoria: "Cartão",
  situacao: "realizado",
  valorCentavos: 15000,
  ...atributos,
});

describe("fluxo de caixa", () => {
  it("soma valores confirmados e a confirmar sem duplicar um lançamento", () => {
    const pendente = movimento({
      id: "aluguel",
      data: outubro + "-25",
      tipo: "saida",
      categoria: "Aluguel",
      situacao: "previsto",
      valorCentavos: 40000,
    });
    const resultado = resumirFluxoCaixa(
      [saldo("bora", 20000), saldo("bar", -10000)],
      [
        movimento(),
        pendente,
        movimento({ id: "anterior", data: "2026-09-10" }),
      ],
      ["bora", "bar"],
      outubro,
      hoje,
    );
    expect(resultado.saldoInicial).toBe(10000);
    expect(resultado.saldoRealizado).toBe(25000);
    expect(resultado.saldoProjetado).toBe(-15000);
    expect(resultado.dias[24]).toEqual({
      data: outubro + "-25",
      saldoRealizado: null,
      saldoProjetado: -15000,
    });
    expect(resultado.lancamentos).toHaveLength(2);
  });

  it("exige abertura explícita, inclusive zero, para calcular o consolidado", () => {
    const abertura = [saldo("bora", 0)];
    const previsto = movimento({ situacao: "previsto" });
    expect(
      resumirFluxoCaixa(abertura, [previsto], ["bora"], outubro, hoje),
    ).toMatchObject({
      saldoInicial: 0,
      saldoRealizado: 0,
      saldoProjetado: 15000,
      vencidos: 1,
    });
    expect(
      resumirFluxoCaixa(abertura, [previsto], ["bora", "bar"], outubro, hoje),
    ).toMatchObject({
      saldoInicial: null,
      saldoRealizado: null,
      saldoProjetado: null,
    });
  });

  it("preserva lançamentos e aberturas em backup e mescla pela identidade correta", () => {
    const db = criarBase();
    db.saldosCaixa = [saldo("bora", 0)];
    db.movimentosCaixa = [movimento()];
    const novo = criarBase();
    novo.saldosCaixa = [saldo("bar", 100), saldo("bora", -150)];
    novo.movimentosCaixa = [movimento({ valorCentavos: 10 })];
    const merged = validarBackup(
      JSON.parse(JSON.stringify(mesclarDados(db, novo))),
    );
    expect(merged.saldosCaixa).toEqual([
      saldo("bora", -150),
      saldo("bar", 100),
    ]);
    expect(merged.movimentosCaixa).toEqual([movimento({ valorCentavos: 10 })]);
    expect(() =>
      validarBackup({
        ...merged,
        movimentosCaixa: [movimento({ data: "2026-02-30" })],
      }),
    ).toThrow();
    expect(() =>
      validarBackup({
        ...merged,
        movimentosCaixa: [movimento({ categoria: "Aluguel" })],
      }),
    ).toThrow();
    expect(() =>
      validarBackup({ ...merged, movimentosCaixa: [movimento(), movimento()] }),
    ).toThrow();
    expect(() =>
      validarBackup({
        ...merged,
        fechamentosFinanceiros: [
          {
            restaurante_id: "bora",
            competencia: outubro,
            receitaBruta: 10,
            descontos: 8,
            estornos: 4,
          },
        ],
      }),
    ).toThrow();
  });
});
