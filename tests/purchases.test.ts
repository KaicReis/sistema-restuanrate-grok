import { describe, it, expect } from "vitest";
import {
  confirmarCompra,
  sugerirInsumo,
  type Compra,
} from "../src/lib/purchases";
import { criarBase } from "../src/lib/storage/seed";
import { migrar } from "../src/lib/storage/migrate";
import { validarBackup } from "../src/lib/storage";
import { insumosMes } from "../src/lib/v2";
import { mesclarDados } from "../src/lib/import-data";
const note = (id: string, op: string): Compra => ({
  id,
  restaurante_id: op,
  fornecedor: "Mercado",
  data: "2026-11-14",
  itens: [
    {
      nome: "Tomate teste",
      quantidade: 2,
      unidade: "kg",
      valorUnitario: 10,
      total: 20,
    },
  ],
});
describe("compras e importação", () => {
  it("confirma uma vez e atualiza preço mensal em centavos", () => {
    const db = migrar(criarBase()),
      n = note("n", "bar");
    confirmarCompra(db, n);
    const i = db.insumos.find((i) => i.nome === "Tomate teste")!;
    expect(i.preco).toBe(2000);
    expect(
      insumosMes(db, "2026-11").find((x) => x.id === i.id)?.quantidade,
    ).toBe(2);
    expect(() => confirmarCompra(db, n)).toThrow();
    expect(() => validarBackup(db)).not.toThrow();
    expect(sugerirInsumo(db, "bar", "TOMATE TESTE")).toBe(i.id);
  });
  it("recusa insumo de outra operação", () => {
    const db = migrar(criarBase()),
      n = note("n", "bar");
    n.itens[0].insumo_id = db.insumos.find(
      (i) => i.restaurante_id !== "bar",
    )!.id;
    expect(() => confirmarCompra(db, n)).toThrow();
  });
  it("não sobrescreve o preço atual ao lançar mês antigo", () => {
    const db = migrar(criarBase());
    confirmarCompra(db, note("a", "bar"));
    const i = db.insumos.find((i) => i.nome === "Tomate teste")!;
    const old = note("b", "bar");
    old.data = "2026-10-10";
    old.itens[0] = {
      ...old.itens[0],
      insumo_id: i.id,
      total: 10,
      valorUnitario: 5,
    };
    confirmarCompra(db, old);
    expect(i.preco).toBe(2000);
    expect(i.historicoPrecos?.["2026-10"].preco).toBe(1000);
  });
  it("recusa data inexistente, totais divergentes e nenhuma linha selecionada", () => {
    for (const mutate of [
      (n: Compra) => (n.data = "2026-02-30"),
      (n: Compra) => (n.itens[0].total = 500),
      (n: Compra) => (n.itens[0].ignorar = true),
    ]) {
      const db = migrar(criarBase()),
        n = note("n", "bar");
      mutate(n);
      expect(() => confirmarCompra(db, n)).toThrow();
    }
  });
  it("mescla backups e arquiva versões integrais nos conflitos", () => {
    const a = migrar(criarBase()),
      b = structuredClone(a);
    b.restaurantes[0].nome = "Editado";
    confirmarCompra(b, note("n", "bar"));
    const merged = mesclarDados(a, b);
    expect(merged.restaurantes[0].nome).toBe("Editado");
    expect(merged.compras).toHaveLength(1);
    expect(merged.importacoes).toHaveLength(2);
    expect(() => validarBackup(merged)).not.toThrow();
  });
});
