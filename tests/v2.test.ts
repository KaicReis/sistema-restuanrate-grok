import { describe, it, expect, vi } from "vitest";
import { criarBase, novoDNA, novosCanais } from "../src/lib/storage/seed";
import { migrar } from "../src/lib/storage/migrate";
import { validarBackup, repositorio } from "../src/lib/storage";
import { ratear, rateioAluguel, consolidar, dnaComRateio, insumosMes } from "../src/lib/v2";
import {
  custoReceita,
  calcularCMV,
  entradaPreco,
  numeroBR,
  paraCentavos,
} from "../src/lib/dna";
import type { ReceitaCasa, Insumo, Produto } from "../src/lib/types";
const insumo: Insumo = {
  id: "i",
  restaurante_id: "bora",
  nome: "Óleo",
  unidade: "L",
  quantidade: 1,
  preco: 1000,
  rendimento: 100,
};
const receita: ReceitaCasa = {
  id: "r",
  restaurante_id: "bora",
  nome: "Molho",
  unidade: "ml",
  rendimento: 800,
  perda: 20,
  itens: [{ insumo_id: "i", quantidade: 1000, perda: 0 }],
};
const prato: Produto = {
  id: "p",
  restaurante_id: "bora",
  nome: "Burger",
  rendimento: 1,
  embalagem: 0,
  itens: [{ insumo_id: "", receita_id: "r", quantidade: 100, perda: 0 }],
};
describe("rateio e consolidação", () => {
  function base() {
    const db = criarBase();
    db.fechamentosFinanceiros = [];
    for (const [id, fat] of [
      ["bora", 60000],
      ["nativos", 30000],
      ["bar", 10000],
    ] as const) {
      db.dnas.push({
        ...novoDNA(id, "2026-11"),
        faturamento: 999999,
        tipoFaturamento: "meta",
        cmvReal: fat * 0.2,
        variaveisReais: fat * 0.1,
      });
      db.fechamentosFinanceiros.push({
        restaurante_id: id, competencia: "2026-11",
        receitaBruta: fat, descontos: 0, estornos: 0, impostos: fat * 0.1, fixos: 0,
      });
    }
    db.alugueis = [
      {
        competencia: "2026-11",
        valor: 10001,
        regra: "faturamento",
        percentuais: {},
      },
    ];
    return db;
  }
  it("distribui proporcionalmente e preserva cada centavo", () => {
    const db = base(),
      r = ratear(db, "2026-11");
    expect(r).toEqual({ bora: 6001, nativos: 3000, bar: 1000 });
    expect(Object.values(r).reduce((s, v) => s + v, 0)).toBe(10001);
    expect(dnaComRateio(db, "bora", "2026-11").fixos).toHaveLength(1);
    expect(db.dnas[0].fixos).toHaveLength(0);
  });
  it("aceita percentuais fixos e rejeita soma diferente de 100", () => {
    const db = base();
    db.alugueis![0] = {
      competencia: "2026-11",
      valor: 10000,
      regra: "fixo",
      percentuais: { bora: 50, nativos: 25, bar: 25 },
    };
    expect(ratear(db, "2026-11")).toEqual({
      bora: 5000,
      nativos: 2500,
      bar: 2500,
    });
    db.alugueis![0].percentuais.bar = 24;
    expect(() => validarBackup(db)).toThrow("100%");
  });
  it("reparte igualmente os centavos na falta de realizado e exclui Vinhos", () => {
    const db = base();
    db.restaurantes.push(
      { id: "marias", nome: "Maria’s", regime: "Simples" },
      { id: "vinhos", nome: "Carta de Vinhos", regime: "Simples" },
    );
    const rateio = rateioAluguel(db, "2026-11");
    expect(rateio.criterio).toBe("igual-provisorio");
    expect(rateio.valores.vinhos).toBe(0);
    expect([rateio.valores.bora, rateio.valores.nativos, rateio.valores.bar, rateio.valores.marias].sort())
      .toEqual([2500, 2500, 2500, 2501]);
    expect(Object.values(rateio.valores).reduce((s, v) => s + v, 0)).toBe(10001);
  });
  it("respeita realizado explícito do DNA e percentuais provisórios até completar a receita", () => {
    const db = base();
    db.fechamentosFinanceiros = db.fechamentosFinanceiros!.filter(({ restaurante_id }) => restaurante_id !== "bora");
    db.alugueis![0].percentuais = { bora: 50, nativos: 30, bar: 20 };
    expect(rateioAluguel(db, "2026-11").criterio).toBe("fixo-provisorio");
    expect(ratear(db, "2026-11")).toEqual({ bora: 5001, nativos: 3000, bar: 2000 });
    Object.assign(db.dnas[0], { faturamento: 60000, tipoFaturamento: "realizado" });
    expect(rateioAluguel(db, "2026-11").criterio).toBe("realizado");
    expect(ratear(db, "2026-11")).toEqual({ bora: 6001, nativos: 3000, bar: 1000 });
  });
  it("preserva percentuais fixos antigos ao retirar Vinhos do aluguel", () => {
    const db = base();
    db.restaurantes.push({ id: "vinhos", nome: "Carta de Vinhos", regime: "Simples" });
    db.alugueis![0] = {
      competencia: "2026-11", valor: 15000, regra: "fixo",
      percentuais: { bora: 25, nativos: 25, bar: 25, vinhos: 25 },
    };
    expect(() => validarBackup(db)).not.toThrow();
    expect(ratear(db, "2026-11")).toEqual({ bora: 5000, nativos: 5000, bar: 5000, vinhos: 0 });
  });
  it("consolida operações sem somar a Vila ou duplicar aluguel", () => {
    const db = base();
    db.dnas.push({ ...novoDNA("a-vila", "2026-11"), faturamento: 999999 });
    const c = consolidar(db, "2026-11");
    expect(c.receita).toBe(100000);
    expect(c.fixos).toBe(10001);
    expect(c.cmv).toBe(20000);
    expect(c.lucro).toBe(49999);
    expect(c.margem).toBeCloseTo(0.49999);
    expect(c.rows).toHaveLength(3);
  });
  it("não apresenta margem fictícia quando faltam custos mensais", () => {
    const db = base();
    delete db.dnas[0].cmvReal;
    expect(consolidar(db, "2026-11").margem).toBeNull();
  });
});
describe("receitas da casa e canais", () => {
  it("calcula rendimento, conversão e perda, propagando custo até o prato", () => {
    expect(custoReceita(receita, [insumo], [receita]).toNumber()).toBe(1.5625);
    expect(calcularCMV(prato, [insumo], [receita])).toBe(156.25);
    expect(calcularCMV(prato, [{ ...insumo, preco: 2000 }], [receita])).toBe(
      312.5,
    );
  });
  it("encadeia receitas e bloqueia ciclos", () => {
    const outra: ReceitaCasa = {
      ...receita,
      id: "r2",
      rendimento: 100,
      perda: 0,
      itens: [{ insumo_id: "", receita_id: "r", quantidade: 100, perda: 0 }],
    };
    expect(custoReceita(outra, [insumo], [receita, outra]).toNumber()).toBe(
      1.5625,
    );
    const circular = {
      ...receita,
      itens: [{ insumo_id: "", receita_id: "r2", quantidade: 1, perda: 0 }],
    };
    expect(() => custoReceita(circular, [insumo], [circular, outra])).toThrow(
      "circular",
    );
    const db = criarBase();
    db.insumos.push(insumo);
    db.receitas = [circular, outra];
    expect(() => validarBackup(db)).toThrow("circular");
  });
  it("cobra cortesias só no salão", () => {
    const d = { ...novoDNA("bora", "2026-11"), faturamento: 100000 };
    const [s, , delivery] = novosCanais("bora", "2026-11");
    const p = {
      ...prato,
      itens: [
        ...prato.itens,
        { insumo_id: "i", quantidade: 100, perda: 0, canal: "Salão" },
      ],
    };
    expect(
      Number(entradaPreco(d, s, p, [insumo], [receita]).cmvIngredientes),
    ).toBe(256.25);
    expect(
      Number(entradaPreco(d, delivery, p, [insumo], [receita]).cmvIngredientes),
    ).toBe(156.25);
  });
  it("isola operações e preços pendentes", () => {
    expect(() =>
      calcularCMV(prato, [{ ...insumo, precoPendente: true }], [receita]),
    ).toThrow("pendente");
    expect(() =>
      calcularCMV({ ...prato, restaurante_id: "bar" }, [insumo], [receita]),
    ).toThrow();
  });
});
describe("migração e dados iniciais", () => {
  it("preserva v1 integralmente, adiciona seeds e pode repetir sem duplicar", () => {
    const old = {
      version: 1 as const,
      restaurantes: [
        { id: "a-vila", nome: "A Vila", regime: "Simples" as const },
        { id: "bora", nome: "Bora", regime: "Simples" as const },
        { id: "nativos", nome: "Nativo", regime: "Simples" as const },
      ],
      dnas: [],
      canais: [],
      insumos: [insumo],
      produtos: [
        { ...prato, itens: [{ insumo_id: "i", quantidade: 1, perda: 0 }] },
      ],
      precos: [],
    };
    const d = migrar(old);
    expect(d.legadoV1).toEqual(old);
    expect(d.insumos.find((i) => i.id === "i")).toMatchObject(insumo);
    expect(migrar(d)).toEqual(d);
    expect(() => validarBackup(d)).not.toThrow();
  });
  it("separa VM/VG e remove comprados prontos das receitas; mantém composição do dono pendente", () => {
    const d = criarBase();
    expect(d.insumos.some((i) => /camarão VM/i.test(i.nome))).toBe(true);
    expect(d.insumos.some((i) => /camarão VG/i.test(i.nome))).toBe(true);
    expect(
      d.receitas!.some((r) =>
        /coxinha|guioza|picles|gari|harumaki|pastel/i.test(r.nome),
      ),
    ).toBe(false);
    for (const nome of [
      "Maionese verde",
      "Farofa de bacon",
      "Blend de hambúrguer",
    ])
      expect(d.receitas!.find((r) => r.nome === nome)?.itens).toEqual([]);
    expect(d.produtos.filter((p) => p.precoCardapio)).toHaveLength(113);
  });
  it("preserva custos de meses anteriores e propaga o novo preço só a partir do mês informado", () => {
    const db = criarBase();
    db.insumos = [
      {
        ...insumo,
        historicoPrecos: {
          "0000-01": { ...insumo },
          "2026-11": { ...insumo, preco: 2000 },
        },
      },
    ];
    expect(insumosMes(db, "2026-10")[0].preco).toBe(1000);
    expect(insumosMes(db, "2026-11")[0].preco).toBe(2000);
    expect(insumosMes(db, "2026-12")[0].preco).toBe(2000);
  });
  it("interpreta entradas brasileiras sem erro de centavos", () => {
    expect(numeroBR("1.234,56")).toBe(1234.56);
    expect(paraCentavos("59,17")).toBe(5917);
    expect(() => numeroBR("abc")).toThrow();
  });
});

describe("regressões de dados mensais", () => {
  it("mantém a chave v1 original depois de salvar a migração em v2", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => data.set(k, v),
    });
    const old = {
      version: 1,
      restaurantes: [
        { id: "bora", nome: "Bora", regime: "Simples" },
        { id: "nativos", nome: "Nativo", regime: "Simples" },
        { id: "a-vila", nome: "A Vila", regime: "Simples" },
      ],
      dnas: [],
      canais: [],
      produtos: [],
      insumos: [insumo],
      precos: [],
    };
    const raw = JSON.stringify(old);
    localStorage.setItem("dna-restaurante:v1", raw);
    const db = repositorio.carregar();
    repositorio.salvar(db);
    expect(localStorage.getItem("dna-restaurante:v1")).toBe(raw);
    expect(
      JSON.parse(localStorage.getItem("dna-restaurante:v2")!).legadoV1,
    ).toEqual(old);
  });
  it("conta a totalidade do aluguel no custo do grupo com rateio provisório", () => {
    const db = criarBase();
    db.alugueis = [
      { competencia: "2026-11", valor: 750000, regra: "faturamento", percentuais: {} },
    ];
    expect(consolidar(db, "2026-11").fixos).toBe(750000);
    expect(rateioAluguel(db, "2026-11").criterio).toBe("igual-provisorio");
  });
  it("calcula equilíbrio do grupo pela contribuição ponderada do DRE", () => {
    const db = criarBase();
    db.fechamentosFinanceiros = [];
    for (const [id, receita, cmv] of [
      ["bora", 100000, 20000],
      ["nativos", 300000, 180000],
      ["bar", 0, 0],
    ] as const) {
      db.dnas.push({
        ...novoDNA(id, "2026-11"), faturamento: receita,
        cmvReal: cmv, variaveisReais: 0,
      });
      db.fechamentosFinanceiros.push({
        restaurante_id: id, competencia: "2026-11",
        receitaBruta: receita, descontos: 0, estornos: 0, impostos: receita / 10, fixos: 0,
      });
    }
    db.alugueis = [
      { competencia: "2026-11", valor: 100000, regra: "fixo", percentuais: { bora: 80, nativos: 20, bar: 0 } },
    ];
    expect(consolidar(db, "2026-11").equilibrio).toBe(250000);
  });
  it("não soma embalagem do canal quando já existe como ingrediente", () => {
    const d = { ...novoDNA("bora", "2026-11"), faturamento: 100000 },
      c = { ...novosCanais("bora", "2026-11")[0], embalagem: 500 };
    const embalagem = {
      ...insumo,
      nome: "Embalagem",
      unidade: "un" as const,
      categoria: "embalagem",
      preco: 200,
    };
    const p = {
      ...prato,
      embalagem: 100,
      itens: [{ insumo_id: "i", quantidade: 1, perda: 0 }],
    };
    expect(entradaPreco(d, c, p, [embalagem]).embalagem).toBe(0);
    expect(Number(entradaPreco(d, c, p, [embalagem]).cmvIngredientes)).toBe(
      200,
    );
  });
});
