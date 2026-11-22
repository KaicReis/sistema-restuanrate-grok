import type { Database } from "./types";
// A versão recebida prevalece nos conflitos, e as duas versões integrais ficam no backup.
export function mesclarDados(atual: Database, recebido: Database): Database {
  const next = structuredClone(atual);
  for (const key of [
    "restaurantes",
    "dnas",
    "canais",
    "insumos",
    "produtos",
    "combos",
    "precos",
    "receitas",
    "alugueis",
    "capitais",
    "compras",
    "saldosCaixa",
    "movimentosCaixa",
    "fechamentosFinanceiros",
    "vendasAnotai",
  ] as const) {
    const identity = (r: Record<string, unknown>) =>
      key === "alugueis" || key === "vendasAnotai"
        ? String(r.competencia)
        : key === "capitais" ||
            key === "dnas" ||
            key === "saldosCaixa" ||
            key === "fechamentosFinanceiros"
          ? `${r.restaurante_id}:${r.competencia}`
          : String(r.id);
    const map = new Map<string, unknown>();
    for (const r of [...(atual[key] ?? []), ...(recebido[key] ?? [])])
      map.set(
        identity(r as unknown as Record<string, unknown>),
        structuredClone(r),
      );
    (next as unknown as Record<string, unknown>)[key] = [...map.values()];
  }
  next.importacoes = [
    ...(atual.importacoes ?? []),
    { data: atual, criadoEm: new Date().toISOString() },
    { data: recebido, criadoEm: new Date().toISOString() },
  ];
  return next;
}
