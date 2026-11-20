import type { Insumo } from "./types";

export const embalagensBora = [
  { id: "bora-embalagem-combo-color", nome: "Embalagem para combo delivery Color", quantidade: 50, preco: 13990 },
  { id: "bora-saco-kraft-bora-comer", nome: "Saco kraft médio sem alça Bora Comer", quantidade: 100, preco: 8070 },
  { id: "bora-embalagem-batata-color", nome: "Embalagem para batata frita Color", quantidade: 100, preco: 6260 },
  { id: "bora-papel-acoplado-vermelho", nome: "Papel acoplado xadrez vermelho", quantidade: 500, preco: 7960 },
] as const;

export function embalagensBoraPendentes(insumos: Insumo[]) {
  return embalagensBora.filter((modelo) => !insumos.some((i) =>
    i.id === modelo.id ||
    (i.restaurante_id === "bora" && i.nome.trim().toLocaleLowerCase("pt-BR") === modelo.nome.toLocaleLowerCase("pt-BR")),
  ));
}

export function insumoArquivado(insumo: Insumo): boolean {
  return insumo.arquivado ?? (
    insumo.restaurante_id === "bora" && insumo.id === "seed-bora-i0"
  );
}
