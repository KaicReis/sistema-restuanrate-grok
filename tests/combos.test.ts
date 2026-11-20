import { expect, it } from "vitest";
import { cotarCombo, type Combo } from "../src/lib/combos";
import { novoDNA } from "../src/lib/storage/seed";
import type { Canal, Database, Produto } from "../src/lib/types";
import { validarBackup } from "../src/lib/storage";

it("calcula quantidades, embalagem única e preço avulso do combo", () => {
  const restaurante_id = "bora";
  const competencia = "2026-11";
  const canal: Canal = { id: "salao", restaurante_id, competencia, nome: "Salão", taxas: [], custoUnidade: 25, embalagem: 80 };
  const produto = (id: string): Produto => ({
    id, nome: id, restaurante_id, rendimento: 1, embalagem: 50,
    itens: [{ insumo_id: "base", quantidade: 1, perda: 0 }],
  });
  const db: Database = {
    version: 2, receitas: [], alugueis: [], restaurantes: [{ id: restaurante_id, nome: "Bora", regime: "Simples" }],
    dnas: [{ ...novoDNA(restaurante_id, competencia), faturamento: 100_000 }],
    canais: [canal], insumos: [
      { id: "base", nome: "Base", restaurante_id, unidade: "un", quantidade: 1, preco: 400, rendimento: 100 },
      { id: "pote", nome: "Embalagem", restaurante_id, unidade: "un", quantidade: 1, preco: 100, rendimento: 100 },
    ],
    produtos: [produto("lanche"), produto("batata")],
    precos: ["lanche", "batata"].map((produto_id) => ({ id: produto_id, restaurante_id, produto_id, canal_id: canal.id, valor: 1000 })),
  };
  db.produtos[1].itens.push({ insumo_id: "pote", quantidade: 1, perda: 0 });
  const combo: Combo = {
    id: "combo", nome: "Combo 1", restaurante_id, canal: canal.nome,
    itens: [{ produto_id: "lanche", quantidade: 2 }, { produto_id: "batata", quantidade: 1 }],
    preco: 2500,
  };
  db.combos = [combo];
  expect(validarBackup(db).combos).toEqual([combo]);
  const duplo = { ...combo, itens: [{ produto_id: "lanche", quantidade: 2 }] };
  expect(validarBackup({ ...db, combos: [duplo] }).combos).toEqual([duplo]);
  expect(cotarCombo(db, duplo, canal).avulsos).toBe(2000);
  const cotacao = cotarCombo(db, combo, canal);
  expect(cotacao.custo.toNumber()).toBe(1485);
  expect(cotacao.avulsos).toBe(3000);
  expect(cotacao.minimo.viavel).toBe(true);
  expect(cotarCombo(db, { ...combo, embalagem: 60 }, canal).custo.toNumber()).toBe(1285);
  db.insumos.push(
    { id: "caixa", nome: "Caixa", categoria: "embalagem", restaurante_id, unidade: "un", quantidade: 50, preco: 13990, rendimento: 100 },
    { id: "papel", nome: "Papel acoplado", categoria: "embalagem", restaurante_id, unidade: "un", quantidade: 500, preco: 7960, rendimento: 100 },
  );
  const embalado = {
    ...combo,
    embalagens: [{ insumo_id: "caixa", quantidade: 1 }, { insumo_id: "papel", quantidade: 2 }],
  };
  expect(validarBackup({ ...db, combos: [embalado] }).combos).toEqual([embalado]);
  expect(cotarCombo(db, embalado, canal).custo.toNumber()).toBe(1536.64);
  expect(() => validarBackup({ ...db, combos: [{ ...embalado, embalagem: 60 }] })).toThrow(/Combo inválido/);
  expect(() => validarBackup({ ...db, combos: [{ ...combo, embalagens: [{ insumo_id: "base", quantidade: 1 }] }] })).toThrow(/Combo inválido/);
  db.produtos[1].pendente = true;
  expect(() => cotarCombo(db, combo, canal)).toThrow(/batata/);
  db.produtos[1].restaurante_id = "outra";
  expect(() => validarBackup(db)).toThrow();
});
