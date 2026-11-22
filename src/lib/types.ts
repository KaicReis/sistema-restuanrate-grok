export type Regime = "MEI" | "Simples" | "Outro";
export interface Restaurante {
  id: string;
  nome: string;
  regime: Regime;
  grupo?: boolean;
}
export interface Registro {
  id: string;
  restaurante_id: string;
}
export interface CustoFixo {
  id: string;
  categoria: string;
  descricao: string;
  valor: number;
  natureza: "operacional" | "amortizacao" | "outro";
}
export interface DNA extends Registro {
  competencia: string;
  faturamento: number;
  tipoFaturamento: "meta" | "realizado";
  fixos: CustoFixo[];
  imposto: number;
  margem: number;
  historico?: boolean;
  cmvReal?: number;
  variaveisReais?: number;
}
export interface Taxa {
  id: string;
  descricao: string;
  percentual: number;
}
export interface Canal extends Registro {
  competencia: string;
  nome: string;
  taxas: Taxa[];
  custoUnidade: number;
  embalagem: number | null;
}
export type Unidade = "kg" | "g" | "L" | "ml" | "un";
export interface Insumo extends Registro {
  arquivado?: boolean;
  conversoes?: { chave: string; conteudo: number; unidade: Unidade }[];
  nome: string;
  unidade: Unidade;
  quantidade: number;
  unidadesNaCompra?: number;
  preco: number;
  rendimento: number;
  precoPendente?: boolean;
  categoria?: string;
  historicoPrecos?: Record<
    string,
    {
      preco: number;
      quantidade: number;
      unidadesNaCompra?: number;
      unidade: Unidade;
      rendimento: number;
      precoPendente?: boolean;
    }
  >;
}
export interface ItemFicha {
  insumo_id: string;
  receita_id?: string;
  unidade?: Unidade;
  canal?: string;
  confirmar?: boolean;
  quantidade: number;
  perda: number;
}
export interface Produto extends Registro {
  nome: string;
  rendimento: number;
  itens: ItemFicha[];
  embalagem: number;
  pendente?: boolean;
  precoCardapio?: number;
  notas?: string;
}
export interface ReceitaCasa extends Registro {
  nome: string;
  rendimento: number;
  unidade: Unidade;
  perda: number;
  itens: ItemFicha[];
  pendente?: boolean;
  notas?: string;
}
export interface Rateio {
  competencia: string;
  valor: number;
  regra: "faturamento" | "fixo";
  percentuais: Record<string, number>;
}
export interface Preco extends Registro {
  produto_id: string;
  canal_id: string;
  valor: number;
}
export interface Database {
  combos?: import("./combos").Combo[];
  version: 1 | 2;
  capitais?: import("./capital").Capital[];
  saldosCaixa?: import("./fluxo-caixa").SaldoCaixa[];
  movimentosCaixa?: import("./fluxo-caixa").MovimentoCaixa[];
  fechamentosFinanceiros?: import("./financeiro").FechamentoFinanceiro[];
  compras?: import("./purchases").Compra[];
  vendasAnotai?: import("./vendas-anotai").VendaAnotaiMensal[];
  vendasSetoresEstimadas?: import("./vendas-estimadas-setor").VendaSetorEstimadaMensal[];
  importacoes?: { data: unknown; criadoEm: string }[];
  receitas?: ReceitaCasa[];
  alugueis?: Rateio[];
  legadoV1?: unknown;
  restaurantes: Restaurante[];
  dnas: DNA[];
  canais: Canal[];
  insumos: Insumo[];
  produtos: Produto[];
  precos: Preco[];
}
