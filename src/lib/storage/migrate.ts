import type { Database } from "../types";
import { semHistoricoAninhado } from "../historico-importacoes";
import cardapio from "./cardapio.json";
export function migrar(db: Database): Database {
  if (db.version === 2) return db;
  const next = structuredClone(db);
  next.legadoV1 = structuredClone(semHistoricoAninhado(db));
  next.version = 2;
  if (!next.restaurantes.some((r) => r.id === "bar"))
    next.restaurantes.push({ id: "bar", nome: "Bar", regime: "Simples" });
  const vila = next.restaurantes.find((r) => r.id === "a-vila");
  if (vila) vila.grupo = true;
  next.receitas = [];
  next.alugueis = [];
  // Mantém todo o original no backup e move os cadastros antigos da Vila para a cozinha Nativo's.
  for (const key of ["insumos", "produtos", "precos", "canais"] as const)
    for (const r of next[key])
      if (r.restaurante_id === "a-vila") r.restaurante_id = "nativos";
  // Canais têm IDs próprios: não altera referências dos preços existentes.
  for (const d of next.dnas.filter((d) => d.restaurante_id === "a-vila")) {
    const aluguel = d.fixos.filter((f) => /aluguel/i.test(f.descricao));
    if (aluguel.length)
      next.alugueis.push({
        competencia: d.competencia,
        valor: aluguel.reduce((s, f) => s + f.valor, 0),
        regra: "faturamento",
        percentuais: {},
      });
    // Não inventa a operação das demais despesas históricas; ficam no legado para revisão.
  }
  for (const i of next.insumos)
    i.historicoPrecos = {
      "0000-01": {
        preco: i.preco,
        quantidade: i.quantidade,
        unidadesNaCompra: i.unidadesNaCompra,
        unidade: i.unidade,
        rendimento: i.rendimento,
        precoPendente: !!i.precoPendente,
      },
    };
  // Nunca sobrescreve cadastros da v1; seeds têm IDs estáveis e só completam nomes ausentes.
  const ids = new Map<string, string>();
  for (const i of cardapio.insumos) {
    const old = next.insumos.find(
      (x) =>
        x.restaurante_id === i.restaurante_id &&
        x.nome.toLocaleLowerCase() === i.nome.toLocaleLowerCase(),
    );
    ids.set(i.id, old?.id ?? i.id);
    if (!old) next.insumos.push(i as Database["insumos"][number]);
  }
  next.receitas = cardapio.receitas.map((r) => ({
    ...r,
    itens: r.itens.map((i) => ({ ...i, insumo_id: ids.get(i.insumo_id)! })),
  })) as NonNullable<Database["receitas"]>;
  for (const p of cardapio.produtos)
    if (
      !next.produtos.some(
        (x) =>
          x.restaurante_id === p.restaurante_id &&
          x.nome.toLocaleLowerCase() === p.nome.toLocaleLowerCase(),
      )
    )
      next.produtos.push(p);
  return next;
}
