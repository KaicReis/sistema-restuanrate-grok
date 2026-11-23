import type { Database } from "./types";
import { coberturaSalaoAnotai, inicioSalaoAnotai, totalizarVendasAnotai } from "./vendas-anotai";
import type { CanalVenda } from "./vendas-setor-canal";

export function resumoVendas(db: Pick<Database, "vendasAnotai" | "vendasSetorCanal">, mes: string, setor: string) {
  const vendas = db.vendasAnotai ?? [];
  const venda = vendas.find((item) => item.competencia === mes);
  const registro = db.vendasSetorCanal?.find((item) => item.competencia === mes);
  const coberturaSalao = venda ? coberturaSalaoAnotai(venda, inicioSalaoAnotai(vendas)) : "ausente";
  const periodoAte = registro?.periodoAte ?? venda?.periodoAte;
  const parcial = Boolean(periodoAte || coberturaSalao !== "integral");
  const totalDetalhado = registro?.linhas.reduce((total, linha) => {
    const setorCorreto = setor === "a-vila" || linha.restaurante_id === setor;
    return total + (setorCorreto && (linha.canal !== "salao" || coberturaSalao !== "ausente") ? linha.subtotal : 0);
  }, 0);
  const total = totalDetalhado ?? (setor === "a-vila" && venda ? totalizarVendasAnotai(venda).subtotal : null);
  return { venda, registro, coberturaSalao, periodoAte, parcial, total, totalDetalhado };
}

export function selecionarLinhasVendas(
  registro: NonNullable<ReturnType<typeof resumoVendas>["registro"]>,
  setor: string,
  canais: readonly CanalVenda[],
  coberturaSalao: ReturnType<typeof resumoVendas>["coberturaSalao"],
) {
  return registro.linhas.filter((item) => item.restaurante_id === setor &&
    canais.includes(item.canal) && (item.canal !== "salao" || coberturaSalao !== "ausente"));
}
