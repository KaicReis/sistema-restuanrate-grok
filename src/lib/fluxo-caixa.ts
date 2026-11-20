export const LIMITE_CENTAVOS_CAIXA = 100_000_000_000;

export const categoriasCaixa = {
  entrada: ["Cartão", "Pix e dinheiro", "Aplicativos", "Outras entradas"],
  saida: [
    "Fornecedores",
    "Folha de pagamento",
    "Aluguel",
    "Impostos",
    "Outras saídas",
  ],
} as const;

export type TipoCaixa = keyof typeof categoriasCaixa;
export type CategoriaCaixa = (typeof categoriasCaixa)[TipoCaixa][number];
export type SituacaoCaixa = "previsto" | "realizado";

export interface SaldoCaixa {
  restaurante_id: string;
  competencia: string;
  saldoCentavos: number;
}

export interface MovimentoCaixa {
  id: string;
  restaurante_id: string;
  data: string;
  descricao: string;
  tipo: TipoCaixa;
  categoria: CategoriaCaixa;
  situacao: SituacaoCaixa;
  valorCentavos: number;
}

export function dataAtualCaixa() {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const valor = (tipo: string) =>
    partes.find((parte) => parte.type === tipo)?.value;
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

export function ultimoDiaCaixa(competencia: string) {
  const [ano, mes] = competencia.split("-").map(Number);
  const dias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${competencia}-${dias}`;
}

function totalizar(movimentos: MovimentoCaixa[]) {
  return movimentos.reduce(
    (totais, movimento) => {
      totais[movimento.tipo] += movimento.valorCentavos;
      return totais;
    },
    { entrada: 0, saida: 0 },
  );
}

export function resumirFluxoCaixa(
  saldos: readonly SaldoCaixa[],
  movimentos: readonly MovimentoCaixa[],
  operacoes: readonly string[],
  competencia: string,
  hoje: string,
) {
  const ids = new Set(operacoes);
  const abertura = new Map(
    saldos
      .filter(
        (saldo) =>
          saldo.competencia === competencia && ids.has(saldo.restaurante_id),
      )
      .map((saldo) => [saldo.restaurante_id, saldo.saldoCentavos]),
  );
  const saldoInicial =
    ids.size > 0 && abertura.size === ids.size
      ? [...abertura.values()].reduce((total, saldo) => total + saldo, 0)
      : null;
  const lancamentos = movimentos
    .filter(
      (movimento) =>
        ids.has(movimento.restaurante_id) &&
        movimento.data.startsWith(competencia + "-"),
    )
    .sort(
      (a, b) =>
        a.data.localeCompare(b.data) ||
        a.descricao.localeCompare(b.descricao, "pt-BR"),
    );
  const realizados = totalizar(
    lancamentos.filter((m) => m.situacao === "realizado" && m.data <= hoje),
  );
  const previstos = totalizar(
    lancamentos.filter((m) => m.situacao === "previsto"),
  );
  const totais = new Map<string, { realizado: number; projetado: number }>();
  for (const m of lancamentos) {
    const dia = totais.get(m.data) ?? { realizado: 0, projetado: 0 };
    const valor = m.tipo === "entrada" ? m.valorCentavos : -m.valorCentavos;
    dia.projetado += valor;
    if (m.situacao === "realizado" && m.data <= hoje) dia.realizado += valor;
    totais.set(m.data, dia);
  }
  let acumuladoRealizado = 0;
  let acumuladoProjetado = 0;
  const quantidadeDias = Number(ultimoDiaCaixa(competencia).slice(-2));
  const dias = Array.from({ length: quantidadeDias }, (_, i) => {
    const data = `${competencia}-${String(i + 1).padStart(2, "0")}`;
    const total = totais.get(data);
    acumuladoRealizado += total?.realizado ?? 0;
    acumuladoProjetado += total?.projetado ?? 0;
    return {
      data,
      saldoRealizado:
        saldoInicial === null || data > hoje
          ? null
          : saldoInicial + acumuladoRealizado,
      saldoProjetado:
        saldoInicial === null ? null : saldoInicial + acumuladoProjetado,
    };
  });
  const saldoRealizado =
    saldoInicial === null || competencia > hoje.slice(0, 7)
      ? null
      : saldoInicial + realizados.entrada - realizados.saida;
  const saldoProjetado = dias.at(-1)?.saldoProjetado ?? null;
  const vencidos = lancamentos.filter(
    (m) => m.situacao === "previsto" && m.data < hoje,
  ).length;
  return {
    abertura,
    saldoInicial,
    saldoRealizado,
    saldoProjetado,
    realizados,
    previstos,
    dias,
    lancamentos,
    vencidos,
  };
}
