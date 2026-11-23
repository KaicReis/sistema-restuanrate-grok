export const colecoesImportaveis = [
  "restaurantes", "dnas", "canais", "insumos", "produtos", "combos", "precos",
  "receitas", "alugueis", "capitais", "compras", "saldosCaixa", "movimentosCaixa",
  "fechamentosFinanceiros", "vendasAnotai", "vendasSetoresEstimadas",
  "basesPrecificacao", "vendasSetorCanal", "faturamentosConsolidados",
] as const;

export type ColecaoImportavel = (typeof colecoesImportaveis)[number];

export function identidadeRegistro(colecao: ColecaoImportavel, registro: Record<string, unknown>) {
  switch (colecao) {
    case "basesPrecificacao":
      return String(registro.restaurante_id);
    case "alugueis":
    case "vendasAnotai":
    case "vendasSetorCanal":
    case "vendasSetoresEstimadas":
    case "faturamentosConsolidados":
      return String(registro.competencia);
    case "capitais":
    case "dnas":
    case "saldosCaixa":
    case "fechamentosFinanceiros":
      return `${registro.restaurante_id}:${registro.competencia}`;
    case "movimentosCaixa":
      return registro.compra_id === undefined ? `id:${registro.id}` : `compra:${registro.compra_id}`;
    default:
      return String(registro.id);
  }
}
