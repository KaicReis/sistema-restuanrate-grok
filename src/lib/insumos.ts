import type { Insumo } from "./types";

export function insumoArquivado(insumo: Insumo): boolean {
  return insumo.arquivado ?? (
    insumo.restaurante_id === "bora" && insumo.id === "seed-bora-i0"
  );
}
