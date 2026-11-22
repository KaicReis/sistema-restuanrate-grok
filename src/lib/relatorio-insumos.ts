import Decimal from "decimal.js";
import type { Insumo } from "./types";

type PrecoInsumo = Pick<Insumo, "preco" | "quantidade" | "unidade" | "precoPendente">;

const referencia = {
  kg: { unidade: "kg", fator: 1 },
  g: { unidade: "kg", fator: 1000 },
  L: { unidade: "L", fator: 1 },
  ml: { unidade: "L", fator: 1000 },
  un: { unidade: "un", fator: 1 },
} as const;

function normalizar(preco: PrecoInsumo) {
  if (preco.precoPendente || preco.quantidade <= 0 || !Number.isFinite(preco.preco)) return null;
  const { unidade, fator } = referencia[preco.unidade];
  return {
    unidade,
    valor: new Decimal(preco.preco).times(fator).div(preco.quantidade).toNumber(),
  };
}

export function historicoInsumo(insumo: Insumo, mes: string) {
  const snapshots = Object.entries(insumo.historicoPrecos ?? {});
  const historico = snapshots
    .filter(([competencia]) => competencia !== "0000-01" && competencia <= mes)
    .sort(([a], [b]) => b.localeCompare(a))
    .flatMap(([competencia, preco]) => {
      const base = normalizar(preco);
      return base ? [{ competencia, ...base }] : [];
    });
  const atual = historico[0] ?? null;
  const anterior = historico[1] ?? null;
  const variacao = atual && anterior && atual.unidade === anterior.unidade && anterior.valor > 0
    ? (atual.valor - anterior.valor) / anterior.valor
    : null;
  const legado = insumo.historicoPrecos?.["0000-01"] ??
    (snapshots.length === 0 ? insumo : null);
  return {
    historico,
    atual,
    anterior,
    variacao,
    referencia: legado ? normalizar(legado) : null,
  };
}
