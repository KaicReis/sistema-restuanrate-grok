import { describe, expect, it } from "vitest";
import { alertasDeInsumos, compararPrecosInsumo, pratosQueUsamInsumo } from "../src/lib/alertas-insumos";
import type { Database, Insumo, ItemFicha, Produto, ReceitaCasa } from "../src/lib/types";

const mes = "2026-10";
const precoAnterior = { unidade: "kg", quantidade: 1, preco: 1200, rendimento: 100 } as const;
const precoAtual = { unidade: "g", quantidade: 500, preco: 900, rendimento: 100 } as const;

function insumo(id: string, alteracoes: Partial<Insumo> = {}): Insumo {
  return {
    id, nome: id, restaurante_id: "bar", ...precoAtual,
    historicoPrecos: { "2026-09": precoAnterior, [mes]: precoAtual },
    ...alteracoes,
  };
}

function db(insumos: Insumo[]): Database {
  return { version: 2, restaurantes: [], produtos: [], dnas: [], canais: [], precos: [], insumos };
}

function ficha(id: string, itens: ItemFicha[], restaurante_id = "bar"): Produto {
  return { id, nome: id, restaurante_id, rendimento: 1, itens, embalagem: 0 };
}

function receita(id: string, itens: ItemFicha[], restaurante_id = "bar"): ReceitaCasa {
  return { ...ficha(id, itens, restaurante_id), unidade: "g", perda: 0 };
}

const ingrediente = { insumo_id: "limão", quantidade: 50, perda: 0 };
const usada = (id: string): ItemFicha => ({ insumo_id: "", receita_id: id, quantidade: 50, perda: 0 });

describe("altas de preço dos insumos", () => {
  it("compara preços normalizados na competência, sem alertar preço igual, pendente ou de outra unidade", () => {
    const base = db([
      insumo("limão"),
      insumo("arquivado", { arquivado: true }),
      insumo("outra operação", { restaurante_id: "bora" }),
      insumo("mesmo preço", { historicoPrecos: { "2026-09": precoAnterior, [mes]: { ...precoAtual, preco: 600 } } }),
      insumo("pendente", { historicoPrecos: { "2026-09": precoAnterior, [mes]: { ...precoAtual, precoPendente: true } } }),
      insumo("outra unidade", { historicoPrecos: { "2026-09": precoAnterior, [mes]: { ...precoAtual, unidade: "un" } } }),
    ]);
    expect(alertasDeInsumos(base, "bar", mes)).toEqual([{
      insumoId: "limão", nome: "limão", pratos: [],
      alta: { atual: { valor: 1800, unidade: "kg" }, anterior: { valor: 1200, unidade: "kg" }, variacao: 0.5, referenciaAnterior: "09/2026" },
    }]);
    expect(alertasDeInsumos(base, "bar", "2026-09")).toEqual([]);
    expect(alertasDeInsumos(base, "bar", "2026-11")).toEqual([]);
  });

  it("localiza dependências em receitas aninhadas e não repete pratos com várias rotas de consumo", () => {
    const base = db([insumo("limão")]);
    base.receitas = [
      receita("Calda", [ingrediente, usada("Base")]),
      receita("Base", [usada("Calda")]),
      receita("Final", [usada("Base")]),
      receita("Alheia", [ingrediente], "bora"),
    ];
    base.produtos = [
      ficha("Direto", [ingrediente]),
      ficha("Indireto", [usada("Final"), usada("Final")]),
      ficha("Misto", [ingrediente, usada("Base"), usada("Calda")]),
      ficha("Sem limão", [usada("Alheia"), { ...ingrediente, quantidade: 0 }]),
      ficha("Outro setor", [ingrediente], "bora"),
    ];

    expect(pratosQueUsamInsumo(base, "bar", "limão").map(({ produto, direto, viaReceitas }) => ({ nome: produto.nome, direto, viaReceitas }))).toEqual([
      { nome: "Direto", direto: true, viaReceitas: [] },
      { nome: "Indireto", direto: false, viaReceitas: ["Final"] },
      { nome: "Misto", direto: true, viaReceitas: ["Base", "Calda"] },
    ]);
  });

  it("usa duas compras registradas no mês e ignora linhas descartadas", () => {
    const base = db([insumo("limão", { historicoPrecos: { [mes]: precoAtual } })]);
    const linha = { nome: "Limão", insumo_id: "limão", unidade: "kg", quantidade: 1, conteudo: 1 } as const;
    base.compras = [
      { id: "a", fornecedor: "A", restaurante_id: "bar", data: "2026-10-02", itens: [{ ...linha, valorUnitario: 12, total: 12 }] },
      { id: "b", fornecedor: "B", restaurante_id: "bar", data: "2026-10-03", itens: [{ ...linha, valorUnitario: 90, total: 90, ignorar: true }] },
      { id: "c", fornecedor: "C", restaurante_id: "bar", data: "2026-10-04", itens: [{ ...linha, conteudo: 0.5, valorUnitario: 9, total: 9 }] },
    ];
    expect(alertasDeInsumos(base, "bar", mes)[0]?.alta).toMatchObject({ variacao: 0.5, referenciaAnterior: "compra de 02/10/2026" });
    expect(base.insumos[0].historicoPrecos).toEqual({ [mes]: precoAtual });
  });

  it("compara uma edição manual intramês enquanto corresponder ao snapshot exibido", () => {
    const base = db([insumo("limão", { historicoPrecos: { [mes]: precoAtual } })]);
    const alta = compararPrecosInsumo(precoAtual, precoAnterior, "preço antes da última edição")!;
    expect(alertasDeInsumos(base, "bar", mes, { insumoId: "limão", mes, alta })[0]?.alta).toEqual(alta);
    expect(alertasDeInsumos(base, "bar", mes, { insumoId: "limão", mes: "2026-09", alta })).toEqual([]);
    base.insumos[0].historicoPrecos![mes] = { ...precoAtual, preco: 1000 };
    expect(alertasDeInsumos(base, "bar", mes, { insumoId: "limão", mes, alta })).toEqual([]);
  });
});
