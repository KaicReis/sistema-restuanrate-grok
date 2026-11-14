import type { Database, DNA, Canal } from "../types";
export const competenciaAtual = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Bahia",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
export function novoDNA(restaurante_id: string, competencia: string): DNA {
  return {
    id: crypto.randomUUID(),
    restaurante_id,
    competencia,
    faturamento: 0,
    tipoFaturamento: "meta",
    fixos: [],
    imposto: 0,
    margem: 30,
  };
}
export function novosCanais(
  restaurante_id: string,
  competencia: string,
): Canal[] {
  return ["Salão", "Retirada", "Delivery próprio", "Aplicativo"].map(
    (nome) => ({
      id: crypto.randomUUID(),
      restaurante_id,
      competencia,
      nome,
      taxas: [],
      custoUnidade: 0,
      embalagem: null,
    }),
  );
}
export function criarBase(): Database {
  return {
    version: 1,
    restaurantes: [
      { id: "a-vila", nome: "A Vila", regime: "Simples" },
      { id: "nativos", nome: "Nativo’s Sushi", regime: "Simples" },
      { id: "bora", nome: "Bora Burguer’s", regime: "Simples" },
    ],
    dnas: [],
    canais: [],
    insumos: [],
    produtos: [],
    precos: [],
  };
}
export function historicoVila(): DNA {
  return {
    ...novoDNA("a-vila", "2025-04"),
    historico: true,
    faturamento: 14000000,
    fixos: [
      ["Pessoal", "Funcionários", 28500, "operacional"],
      ["Ocupação", "Aluguel", 7500, "operacional"],
      ["Dívidas", "Cheque fornecedor", 5000, "amortizacao"],
      ["Utilidades", "Água", 300, "operacional"],
      ["Utilidades", "Energia", 1200, "operacional"],
      ["Utilidades", "Internet", 300, "operacional"],
      ["Transporte", "Carro", 3000, "operacional"],
      ["Serviços", "Contador", 600, "operacional"],
      ["Pessoal", "Alimentação funcionários", 5000, "operacional"],
    ].map(([categoria, descricao, valor, natureza]) => ({
      id: crypto.randomUUID(),
      categoria: String(categoria),
      descricao: String(descricao),
      valor: Number(valor) * 100,
      natureza: natureza as "operacional" | "amortizacao",
    })),
  };
}
