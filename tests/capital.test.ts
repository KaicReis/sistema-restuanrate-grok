import { describe, it, expect } from "vitest";
import { calcularCapital, type Capital } from "../src/lib/capital";
const base: Capital = {
  restaurante_id: "bar",
  competencia: "2026-11",
  faturamento: 10000000,
  compras: 3000000,
  fornecedores: 10,
  estoqueDias: 20,
  fixos: 1500000,
  aluguel: 300000,
  reserva: 500000,
  pagamentos: [
    { nome: "PIX", percentual: 50, dias: 0 },
    { nome: "Crédito", percentual: 50, dias: 30 },
  ],
};
describe("capital de giro", () => {
  it("pondera PMR e inclui aluguel e reserva em centavos", () => {
    const r = calcularCapital(base);
    expect(r.pmr).toBe(15);
    expect(r.pme).toBe(20);
    expect(r.pmp).toBe(10);
    expect(r.ciclo).toBe(25);
    expect(r.diario).toBe(160000);
    expect(r.necessario).toBe(4500000);
  });
  it("converte estoque em reais para dias", () => {
    expect(
      calcularCapital({
        ...base,
        estoqueDias: undefined,
        estoqueReais: 2000000,
      }).pme,
    ).toBe(20);
  });
  it("não apresenta resultado incompleto e aceita prazo zero", () => {
    expect(
      calcularCapital({ ...base, fixos: undefined }).necessario,
    ).toBeNull();
    expect(calcularCapital({ ...base, fornecedores: 0 }).pmp).toBe(0);
  });
  it("recusa mix incompleto, compras zero e valores não finitos", () => {
    expect(
      calcularCapital({
        ...base,
        pagamentos: [{ nome: "PIX", percentual: 50, dias: 0 }],
      }).necessario,
    ).toBeNull();
    expect(calcularCapital({ ...base, compras: 0 }).necessario).toBeNull();
    expect(calcularCapital({ ...base, reserva: NaN }).necessario).toBeNull();
  });
  it("mantém reserva quando ciclo é negativo", () => {
    expect(calcularCapital({ ...base, fornecedores: 90 }).necessario).toBe(
      500000,
    );
  });
  it("distingue vazio e zero e prioriza estoque em dias", () => {
    expect(
      calcularCapital({ ...base, reserva: undefined }).necessario,
    ).toBeNull();
    expect(
      calcularCapital({ ...base, estoqueDias: 0, estoqueReais: 9999999 }).pme,
    ).toBe(0);
  });
});
