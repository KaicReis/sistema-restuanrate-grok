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
  let longNeckNoBar = 0;
  for (const produto of produtos) {
    const nome = chave(produto.nome);
    if (!nome) continue;
    if (nome === "long neck" && produto.restaurante_id === "bar") longNeckNoBar++;
    const candidatos = porNome.get(nome) ?? new Set<string>();
    candidatos.add(produto.restaurante_id);
    porNome.set(nome, candidatos);
  }
  return (produto: string): { setor: string } | { motivo: "não cadastrado" | "em mais de um setor" | "sem setor ativo" | "precisa de cadastro único no Bar" | "é uma variante de Long neck a conferir" } => {
    const nome = chave(produto);
    // Regra de vendas revisada: o nome exato já existe no catálogo do Bar.
    if (nome === "long neck") {
      return setoresValidos.has("bar") && longNeckNoBar === 1
        ? { setor: "bar" }
        : { motivo: "precisa de cadastro único no Bar" };
    }
    if (/\blong[ -]?necks?\b/u.test(nome)) return { motivo: "é uma variante de Long neck a conferir" };
    const candidatos = porNome.get(nome);
    if (!candidatos?.size) return { motivo: "não cadastrado" };
    if (candidatos.size > 1) return { motivo: "em mais de um setor" };
    const [setor] = candidatos;
    return setoresValidos.has(setor) ? { setor } : { motivo: "sem setor ativo" };
  };
}
