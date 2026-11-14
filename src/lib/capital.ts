export interface Capital {
  restaurante_id: string;
  competencia: string;
  faturamento?: number;
  compras?: number;
  fornecedores?: number;
  estoqueReais?: number;
  estoqueDias?: number;
  fixos?: number;
  aluguel?: number;
  reserva?: number;
  pagamentos: { nome: string; percentual?: number; dias?: number }[];
}
// Valores monetários em centavos. Mês gerencial de 30 dias; reserva em centavos.
export function calcularCapital(c: Capital) {
  const pendentes: string[] = [];
  const valid = (v: number | undefined) =>
    v !== undefined && Number.isFinite(v) && v >= 0;
  for (const [key, label] of [
    ["faturamento", "Faturamento mensal"],
    ["compras", "Compras mensais"],
    ["fornecedores", "Prazo dos fornecedores"],
    ["fixos", "Despesas fixas"],
    ["aluguel", "Aluguel rateado"],
    ["reserva", "Reserva de segurança"],
  ] as const)
    if (!valid(c[key])) pendentes.push(label);
  if (c.compras === 0)
    pendentes.push("Compras mensais maiores que zero para calcular PME");
  if (!valid(c.estoqueDias) && !valid(c.estoqueReais))
    pendentes.push("Estoque médio em reais ou dias");
  const mix = c.pagamentos.reduce((s, p) => s + (p.percentual ?? 0), 0);
  if (
    !c.pagamentos.length ||
    Math.abs(mix - 100) > 0.001 ||
    c.pagamentos.some(
      (p) =>
        !valid(p.percentual) ||
        p.percentual! > 100 ||
        (p.percentual! > 0 && !valid(p.dias)),
    )
  )
    pendentes.push("Mix de pagamentos completo (100%) e prazos");
  if (pendentes.length)
    return {
      pendentes,
      necessario: null,
      pmr: null,
      pme: null,
      pmp: null,
      ciclo: null,
      diario: null,
    };
  const pmr = c.pagamentos.reduce(
    (s, p) => s + (p.percentual! * (p.dias ?? 0)) / 100,
    0,
  );
  const pme = valid(c.estoqueDias)
    ? c.estoqueDias!
    : c.estoqueReais! / (c.compras! / 30);
  const pmp = c.fornecedores!,
    ciclo = pmr + pme - pmp,
    diario = (c.compras! + c.fixos! + c.aluguel!) / 30;
  return {
    pendentes,
    pmr,
    pme,
    pmp,
    ciclo,
    diario,
    necessario: Math.round(Math.max(0, ciclo * diario) + c.reserva!),
  };
}
