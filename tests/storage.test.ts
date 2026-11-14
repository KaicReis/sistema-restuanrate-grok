import { beforeEach, describe, expect, it, vi } from "vitest";
import { repositorio, validarBackup } from "../src/lib/storage";
import {
  criarBase,
  historicoVila,
  novosCanais,
  novoDNA,
} from "../src/lib/storage/seed";
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  });
});
describe("repositório local e backups", () => {
  it("inicializa o grupo e as três operações sem histórico financeiro atual", () => {
    const db = repositorio.carregar();
    expect(db.restaurantes).toHaveLength(4);
    expect(db.dnas).toHaveLength(0);
  });
  it("exporta e importa todos os restaurantes em JSON", () => {
    const db = criarBase();
    db.dnas.push(novoDNA("a-vila", "2026-11"));
    db.canais.push(...novosCanais("a-vila", "2026-11"));
    repositorio.salvar(db);
    expect(repositorio.importar(repositorio.exportar())).toEqual(db);
  });
  it("um backup inválido não substitui os dados atuais", () => {
    const db = criarBase();
    repositorio.salvar(db);
    expect(() => repositorio.importar('{"version":2}')).toThrow();
    expect(repositorio.carregar()).toEqual(db);
  });
  it("rejeita referências cruzadas entre restaurantes", () => {
    const db = criarBase();
    db.insumos.push({
      id: "i",
      restaurante_id: "a-vila",
      nome: "Queijo",
      unidade: "kg",
      quantidade: 1,
      preco: 3300,
      rendimento: 100,
    });
    db.produtos.push({
      id: "p",
      restaurante_id: "bora",
      nome: "Burger",
      rendimento: 1,
      embalagem: 200,
      itens: [{ insumo_id: "i", quantidade: 20, perda: 0 }],
    });
    expect(() => validarBackup(db)).toThrow();
  });
  it("rejeita DNA duplicado no mesmo mês", () => {
    const db = criarBase();
    db.dnas.push(novoDNA("a-vila", "2026-11"), novoDNA("a-vila", "2026-11"));
    expect(() => validarBackup(db)).toThrow();
  });
  it("rejeita valores negativos e meses inválidos", () => {
    const db = criarBase();
    db.dnas.push({ ...novoDNA("a-vila", "2026-13"), faturamento: -1 });
    expect(() => validarBackup(db)).toThrow();
  });
  it("mantém dado corrompido sem sobrescrever silenciosamente", () => {
    localStorage.setItem("dna-restaurante:v1", "inválido");
    expect(() => repositorio.carregar()).toThrow("preservados");
    expect(localStorage.getItem("dna-restaurante:v1")).toBe("inválido");
  });
  it("propaga falta de espaço sem afirmar que salvou", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("quota");
      },
    });
    expect(() => repositorio.salvar(criarBase())).toThrow(
      "Não foi possível salvar",
    );
  });
  it("identifica o histórico e exclui o cheque dos fixos", () => {
    const d = historicoVila();
    expect(d.competencia).toBe("2025-04");
    expect(d.historico).toBe(true);
    expect(
      d.fixos
        .filter((f) => f.natureza === "operacional")
        .reduce((s, f) => s + f.valor, 0),
    ).toBe(4640000);
  });
});
