import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  calcularCMV,
  calcularMargens,
  calcularPrecoDNA,
  custoUnidadeUso,
  dnaDaCompetencia,
  entradaPreco,
  fixosOperacionais,
  paraCentavos,
} from "../src/lib/dna";
import type { Canal, DNA, Insumo, Produto } from "../src/lib/types";
const entrada = {
  faturamentoReferencia: 10000000,
  custosFixosOperacionais: 3000000,
  variaveis: 0.1,
  impostos: 0.06,
  margem: 0.3,
  cmvIngredientes: 1420,
};
const dna: DNA = {
  id: "dna",
  restaurante_id: "r",
  competencia: "2026-11",
  faturamento: 10000000,
  tipoFaturamento: "meta",
  fixos: [
    {
      id: "f",
      categoria: "Geral",
      descricao: "Operacional",
      valor: 3000000,
      natureza: "operacional",
    },
  ],
  imposto: 6,
  margem: 30,
};
const canal: Canal = {
  id: "c",
  restaurante_id: "r",
  competencia: "2026-11",
  nome: "Salão",
  taxas: [{ id: "t", descricao: "Taxas", percentual: 10 }],
  custoUnidade: 0,
  embalagem: null,
};
const insumo: Insumo = {
  id: "i",
  restaurante_id: "r",
  nome: "Ingrediente",
  unidade: "un",
  quantidade: 1,
  preco: 1420,
  rendimento: 100,
};
const produto: Produto = {
  id: "p",
  restaurante_id: "r",
  nome: "Produto",
  rendimento: 1,
  itens: [{ insumo_id: "i", quantidade: 1, perda: 0 }],
  embalagem: 0,
};
describe("DNA financeiro", () => {
  it("confere o exemplo: PV 59,17, markup 4,167 e CMV máximo 24%", () => {
    const r = calcularPrecoDNA(entrada);
    expect(r.viavel).toBe(true);
    if (r.viavel) {
      expect(r.precoMinimo).toBe(5917);
      expect(r.markup).toBeCloseTo(4.1666667);
      expect(r.cmvMaximoPercentual).toBe(0.24);
      expect(r.percentualFixos).toBe(0.3);
    }
  });
  it("bloqueia faturamento zero", () =>
    expect(
      calcularPrecoDNA({ ...entrada, faturamentoReferencia: 0 }).viavel,
    ).toBe(false));
  it.each([10000000, 11000000])("bloqueia fixos >= 100%%: %i", (fixos) =>
    expect(
      calcularPrecoDNA({ ...entrada, custosFixosOperacionais: fixos }).viavel,
    ).toBe(false),
  );
  it.each([0.54, 0.6])("bloqueia soma >= 100%%: %s", (margem) => {
    expect(calcularPrecoDNA({ ...entrada, margem })).toEqual({
      viavel: false,
      motivo: "O DNA não comporta a margem desejada",
    });
  });
  it.each([-1, NaN, Infinity])("rejeita custo inválido %s", (custo) =>
    expect(
      calcularPrecoDNA({ ...entrada, cmvIngredientes: custo }).viavel,
    ).toBe(false),
  );
  it("rejeita taxas maiores que 100%", () =>
    expect(calcularPrecoDNA({ ...entrada, impostos: 1.1 }).viavel).toBe(false));
  it("arredonda sempre para cima, sem aumentar um preço já exato", () => {
    const r = calcularPrecoDNA({
      faturamentoReferencia: 10000,
      custosFixosOperacionais: 0,
      variaveis: 0,
      impostos: 0,
      margem: 0.5,
      cmvIngredientes: 100,
    });
    expect(r.viavel && r.precoMinimo).toBe(200);
  });
  it("aumento de preço do insumo recalcula CMV e preço mínimo sem cache", () => {
    const anterior = entradaPreco(dna, canal, produto, [insumo]),
      atual = entradaPreco(dna, canal, produto, [{ ...insumo, preco: 2000 }]);
    expect(new Decimal(atual.cmvIngredientes).toNumber()).toBe(2000);
    expect(calcularCMV(produto, [insumo])).toBe(1420);
    const a = calcularPrecoDNA(anterior),
      b = calcularPrecoDNA(atual);
    expect(a.viavel && b.viavel && b.precoMinimo > a.precoMinimo).toBe(true);
  });
  it("mudar taxa de canal só altera aquele canal", () => {
    const delivery = {
      ...canal,
      id: "delivery",
      taxas: [{ id: "tx", descricao: "Comissão", percentual: 15 }],
    };
    const salaAntes = calcularPrecoDNA(
      entradaPreco(dna, canal, produto, [insumo]),
    );
    const delAntes = calcularPrecoDNA(
      entradaPreco(dna, delivery, produto, [insumo]),
    );
    const delDepois = calcularPrecoDNA(
      entradaPreco(
        dna,
        {
          ...delivery,
          taxas: [{ id: "tx", descricao: "Comissão", percentual: 20 }],
        },
        produto,
        [insumo],
      ),
    );
    expect(
      calcularPrecoDNA(entradaPreco(dna, canal, produto, [insumo])),
    ).toEqual(salaAntes);
    expect(delDepois).not.toEqual(delAntes);
  });
  it("mudar faturamento recalcula a proporção de fixos", () => {
    const r = calcularPrecoDNA({ ...entrada, faturamentoReferencia: 20000000 });
    expect(r.viavel && r.percentualFixos).toBe(0.15);
  });
  it("troca de mês e restaurante usa o DNA correto", () => {
    const dezembro = {
        ...dna,
        id: "dez",
        competencia: "2026-12",
        faturamento: 20000000,
      },
      outro = { ...dna, id: "outro", restaurante_id: "outro" };
    const todos = [dna, dezembro, outro];
    expect(dnaDaCompetencia(todos, "r", "2026-11")).toEqual(dna);
    expect(dnaDaCompetencia(todos, "r", "2026-12")).toEqual(dezembro);
    expect(dnaDaCompetencia(todos, "outro", "2026-11")).toEqual(outro);
    const r = calcularPrecoDNA(
      entradaPreco(dezembro, { ...canal, competencia: "2026-12" }, produto, [
        insumo,
      ]),
    );
    expect(r.viavel && r.percentualFixos).toBe(0.15);
  });
  it("exclui amortização e outros dos fixos operacionais", () => {
    expect(
      fixosOperacionais({
        ...dna,
        fixos: [
          ...dna.fixos,
          {
            id: "divida",
            categoria: "Dívida",
            descricao: "Cheque",
            valor: 500000,
            natureza: "amortizacao",
          },
          {
            id: "outro",
            categoria: "Outro",
            descricao: "Outro",
            valor: 100000,
            natureza: "outro",
          },
        ],
      }),
    ).toBe(3000000);
  });
  it("embalagem do canal substitui a base, inclusive se for zero", () => {
    expect(
      entradaPreco(
        dna,
        { ...canal, embalagem: 300 },
        { ...produto, embalagem: 200 },
        [insumo],
      ).embalagem,
    ).toBe(300);
    expect(
      entradaPreco(dna, canal, { ...produto, embalagem: 200 }, [insumo])
        .embalagem,
    ).toBe(200);
    expect(
      entradaPreco(
        dna,
        { ...canal, embalagem: 0 },
        { ...produto, embalagem: 200 },
        [insumo],
      ).embalagem,
    ).toBe(0);
  });
  it("inclui embalagem e custo fixo por unidade uma única vez", () => {
    const r = calcularPrecoDNA({
      ...entrada,
      embalagem: 200,
      custoFixoUnidade: 100,
    });
    expect(r.viavel && r.precoMinimo).toBe(7167);
    const m = calcularMargens(
      { ...entrada, embalagem: 200, custoFixoUnidade: 100 },
      10000,
    )!;
    expect(m.contribuicao).toBe(6680);
    expect(m.contribuicaoPercentual).toBe(0.668);
    expect(m.margem).toBe(0.368);
  });
  it("margem no preço sugerido atende à meta", () => {
    const r = calcularPrecoDNA(entrada);
    expect(
      r.viavel && calcularMargens(entrada, r.precoMinimo)!.margem >= 0.3,
    ).toBe(true);
  });
  it("preço zero não permite calcular margem", () =>
    expect(calcularMargens(entrada, 0)).toBeNull());
  it("bloqueia mistura de restaurantes e competências", () => {
    expect(() =>
      entradaPreco(dna, { ...canal, restaurante_id: "outro" }, produto, [
        insumo,
      ]),
    ).toThrow();
    expect(() =>
      entradaPreco(dna, { ...canal, competencia: "2025-04" }, produto, [
        insumo,
      ]),
    ).toThrow();
    expect(() =>
      calcularCMV(produto, [{ ...insumo, restaurante_id: "outro" }]),
    ).toThrow();
  });
});
describe("CMV, unidades e perdas", () => {
  it("normaliza kg em gramas e calcula custo com rendimento", () => {
    const queijo = {
      ...insumo,
      unidade: "kg" as const,
      quantidade: 1,
      preco: 3300,
      rendimento: 80,
    };
    expect(custoUnidadeUso(queijo).toNumber()).toBe(4.125);
    expect(
      calcularCMV(
        {
          ...produto,
          rendimento: 2,
          itens: [{ insumo_id: "i", quantidade: 200, perda: 0 }],
        },
        [queijo],
      ),
    ).toBe(412.5);
  });
  it("normaliza litros em ml", () =>
    expect(
      custoUnidadeUso({ ...insumo, unidade: "L", preco: 1000 }).toNumber(),
    ).toBe(1));
  it("aplica perda adicional do preparo", () =>
    expect(
      calcularCMV(
        { ...produto, itens: [{ insumo_id: "i", quantidade: 1, perda: 20 }] },
        [{ ...insumo, preco: 1000 }],
      ),
    ).toBe(1250));
  it("rejeita rendimento zero e perda de 100%", () => {
    expect(() => custoUnidadeUso({ ...insumo, rendimento: 0 })).toThrow();
    expect(() =>
      calcularCMV(
        { ...produto, itens: [{ insumo_id: "i", quantidade: 1, perda: 100 }] },
        [insumo],
      ),
    ).toThrow();
  });
  it("converte reais para centavos com aritmética decimal", () => {
    expect(paraCentavos("14.20")).toBe(1420);
    expect(paraCentavos("1.005")).toBe(101);
  });
});

it("preserva frações de centavo entre ficha e DNA sem adicionar um centavo indevido", () => {
  const d = {
    ...dna,
    faturamento: 7,
    imposto: 0,
    margem: 0,
    fixos: [{ ...dna.fixos[0], valor: 2 }],
  };
  const c = { ...canal, taxas: [] };
  const p = { ...produto, rendimento: 7 };
  const i = { ...insumo, preco: 5 };
  const r = calcularPrecoDNA(entradaPreco(d, c, p, [i]));
  expect(r.viavel && r.precoMinimo).toBe(1);
});
it("bloqueia preço acima do limite de centavos seguros", () => {
  expect(
    calcularPrecoDNA({ ...entrada, cmvIngredientes: Number.MAX_SAFE_INTEGER })
      .viavel,
  ).toBe(false);
});
