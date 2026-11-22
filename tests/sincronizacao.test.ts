import { describe, expect, it } from "vitest";
import { conciliarDados } from "../src/lib/sincronizacao";
import type { Database } from "../src/lib/types";

const base: Database = {
  version: 2,
  restaurantes: [
    { id: "bora", nome: "Bora", regime: "Simples" },
    { id: "bar", nome: "Bar", regime: "Simples" },
  ],
  dnas: [], canais: [], insumos: [], produtos: [], precos: [],
  alugueis: [
    { competencia: "2026-10", regra: "fixo", valor: 50_000, percentuais: {} },
    { competencia: "2026-11", regra: "fixo", valor: 50_000, percentuais: {} },
  ],
};

describe("Conciliação entre revisões", () => {
  it("mantém alterações simultâneas em registros diferentes e a ordem da nuvem", () => {
    const local = structuredClone(base);
    const remoto = structuredClone(base);
    local.restaurantes[0].nome = "Bora Burguer’s";
    // O jsonb devolve as propriedades em ordem diferente.
    remoto.restaurantes[0] = { regime: "Simples", nome: "Bora", id: "bora" };
    remoto.restaurantes[1].nome = "Bar da Vila";
    remoto.restaurantes.reverse();
    local.alugueis![0].valor = 51_000;
    remoto.alugueis![1].valor = 52_000;
    const resultado = conciliarDados(base, local, remoto);
    expect(resultado?.restaurantes.map(({ nome }) => nome)).toEqual(["Bar da Vila", "Bora Burguer’s"]);
    expect(resultado?.alugueis?.map(({ valor }) => valor)).toEqual([51_000, 52_000]);
  });

  it("interrompe a conciliação quando duas revisões editam o mesmo registro", () => {
    const local = structuredClone(base);
    const remoto = structuredClone(base);
    local.restaurantes[0].nome = "Bora Burguer’s";
    remoto.restaurantes[0].regime = "Outro";
    expect(conciliarDados(base, local, remoto)).toBeNull();
    local.restaurantes[0].nome = "Bora";
    local.alugueis![1].valor = 51_000;
    remoto.alugueis![1].valor = 52_000;
    expect(conciliarDados(base, local, remoto)).toBeNull();
  });

  it("preserva uma exclusão quando o registro foi mantido do outro lado", () => {
    const local = structuredClone(base);
    const remoto = structuredClone(base);
    local.alugueis!.splice(0, 1);
    remoto.alugueis![1].valor = 52_000;
    expect(conciliarDados(base, local, remoto)?.alugueis).toEqual([remoto.alugueis![1]]);
    remoto.alugueis![0].valor = 53_000;
    expect(conciliarDados(base, local, remoto)).toBeNull();
  });
});
