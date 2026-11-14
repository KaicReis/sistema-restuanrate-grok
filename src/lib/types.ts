export type Regime = "MEI" | "Simples" | "Outro";
export interface Restaurante {
  id: string;
  nome: string;
  regime: Regime;
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
  nome: string;
  unidade: Unidade;
  quantidade: number;
  preco: number;
  rendimento: number;
}
export interface ItemFicha {
  insumo_id: string;
  quantidade: number;
  perda: number;
}
export interface Produto extends Registro {
  nome: string;
  rendimento: number;
  itens: ItemFicha[];
  embalagem: number;
}
export interface Preco extends Registro {
  produto_id: string;
  canal_id: string;
  valor: number;
}
export interface Database {
  version: 1;
  restaurantes: Restaurante[];
  dnas: DNA[];
  canais: Canal[];
  insumos: Insumo[];
  produtos: Produto[];
  precos: Preco[];
}
