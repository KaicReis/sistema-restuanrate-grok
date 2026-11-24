import type { Produto, Restaurante } from "./types";

type ProdutoCatalogado = Pick<Produto, "nome" | "restaurante_id">;

function chave(nome: string) {
  return nome.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR").trim().replace(/\s+/gu, " ");
}

export function classificadorProdutoSetor(
  produtos: readonly ProdutoCatalogado[],
  setores: readonly Pick<Restaurante, "id" | "nome">[],
) {
  const setoresValidos = new Set(setores.map(({ id }) => id));
  const porNome = new Map<string, Set<string>>();
  for (const produto of produtos) {
    const nome = chave(produto.nome);
    if (!nome) continue;
    const candidatos = porNome.get(nome) ?? new Set<string>();
    candidatos.add(produto.restaurante_id);
    porNome.set(nome, candidatos);
  }
  return (produto: string): { setor: string } | { motivo: "não cadastrado" | "em mais de um setor" | "sem setor ativo" } => {
    const candidatos = porNome.get(chave(produto));
    if (!candidatos?.size) return { motivo: "não cadastrado" };
    if (candidatos.size > 1) return { motivo: "em mais de um setor" };
    const [setor] = candidatos;
    return setoresValidos.has(setor) ? { setor } : { motivo: "sem setor ativo" };
  };
}
