import { describe, expect, it } from "vitest";
import { calcularCMV, preservarUnidadesDeFicha, unidadesFicha } from "../src/lib/dna";
import { confirmarCompra } from "../src/lib/purchases";
import { validarBackup } from "../src/lib/storage";
import { criarBase } from "../src/lib/storage/seed";
import type { Insumo, Produto, ReceitaCasa } from "../src/lib/types";
import { insumosMes } from "../src/lib/v2";

const queijo: Insumo = {
  id: "mussarela-teste",
  restaurante_id: "bora",
  nome: "Mussarela fatiada",
  unidade: "kg",
  quantidade: 1,
  unidadesNaCompra: 40,
  preco: 4000,
  rendimento: 100,
};

const ficha: Produto = {
  id: "ficha-teste",
  restaurante_id: "bora",
  nome: "Lanche de teste",
  rendimento: 1,
  embalagem: 0,
  itens: [{ insumo_id: queijo.id, quantidade: 2, unidade: "un", perda: 0 }],
};

describe("medidas de uso na ficha técnica", () => {
  it("calcula por fatia ou por massa, preservando a unidade implícita das fichas antigas", () => {
    expect(unidadesFicha(queijo)).toEqual(["g", "kg", "un"]);
    expect(calcularCMV(ficha, [queijo])).toBe(200);
    const [linha] = ficha.itens;
    expect(calcularCMV({ ...ficha, itens: [{ ...linha, unidade: "kg", quantidade: 0.05 }] }, [queijo])).toBe(200);
    expect(calcularCMV({ ...ficha, itens: [{ ...linha, unidade: undefined, quantidade: 50 }] }, [queijo])).toBe(200);
    expect(calcularCMV(ficha, [{ ...queijo, unidade: "un", quantidade: 40 }])).toBe(200);
    expect(calcularCMV(ficha, [{ ...queijo, rendimento: 50 }])).toBe(400);
  });

  it("exige um total de fatias conhecido e recusa unidades incompatíveis", () => {
    const [linha] = ficha.itens;
    expect(() => calcularCMV(ficha, [{ ...queijo, unidadesNaCompra: undefined }])).toThrow(/quantas unidades/);
    expect(() => calcularCMV({ ...ficha, itens: [{ ...linha, unidade: "ml" }] }, [queijo])).toThrow(/não é compatível/);
  });

  it("normaliza o rendimento de receitas compostas e restringe sua dimensão", () => {
    const recheio: ReceitaCasa = {
      id: "recheio-teste",
      restaurante_id: ficha.restaurante_id,
      nome: "Recheio de teste",
      rendimento: 0.5,
      unidade: "kg",
      perda: 0,
      itens: [{ insumo_id: queijo.id, quantidade: 500, perda: 0 }],
    };
    const linha = { insumo_id: "", receita_id: recheio.id, quantidade: 0.05, perda: 0 };
    expect(calcularCMV({ ...ficha, itens: [{ ...linha, unidade: "kg" }] }, [queijo], [recheio])).toBe(200);
    expect(() => calcularCMV({ ...ficha, itens: [{ ...linha, unidade: "un" }] }, [queijo], [recheio])).toThrow(/rendimento desta receita/);
  });

  it("não reinterpreta gramas salvas quando o insumo passa a ser comprado em unidades", () => {
    const db = criarBase();
    db.produtos.push({ ...ficha, itens: [{ insumo_id: queijo.id, quantidade: 50, perda: 0 }] });
    preservarUnidadesDeFicha(db, queijo, "un");
    const produto = db.produtos.at(-1)!;
    expect(produto.itens[0].unidade).toBe("g");
    expect(() => calcularCMV(produto, [{ ...queijo, unidade: "un", quantidade: 40 }])).toThrow(/não é compatível/);
  });

  it("não reutiliza o número de fatias do pacote antigo ao registrar nova compra", () => {
    const db = criarBase();
    db.insumos.push({ ...queijo });
    db.produtos.push(structuredClone(ficha));
    confirmarCompra(db, {
      id: "compra-teste",
      restaurante_id: "bora",
      data: "2026-11-20",
      fornecedor: "Fornecedor",
      totalProdutos: 45,
      totalNota: 45,
      itens: [{ insumo_id: queijo.id, nome: queijo.nome, quantidade: 1, unidade: "kg", valorUnitario: 45, total: 45 }],
    });
    const antes = insumosMes(db, "2026-10").find((i) => i.id === queijo.id)!;
    const depois = insumosMes(db, "2026-11").find((i) => i.id === queijo.id)!;
    expect(calcularCMV(ficha, [antes])).toBe(200);
    expect(depois.unidadesNaCompra).toBeUndefined();
    expect(() => calcularCMV(ficha, [depois])).toThrow(/quantas unidades/);
    expect(validarBackup(JSON.parse(JSON.stringify(db))).produtos.at(-1)?.itens[0].unidade).toBe("un");
    expect(() => validarBackup({
      ...db,
      insumos: [{ ...queijo, unidadesNaCompra: 1.5 }],
    })).toThrow(/Insumo inválido/);
  });
});
