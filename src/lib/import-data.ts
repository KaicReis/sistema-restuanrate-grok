import type { Database } from "./types";
import { colecoesImportaveis, identidadeRegistro } from "./identidade-colecoes";
import { compactarHistorico, semHistoricoAninhado } from "./historico-importacoes";

// A versão recebida prevalece nos conflitos, preservando baixas de compras já pagas.
export function mesclarDados(atual: Database, recebido: Database): Database {
  const next = structuredClone(semHistoricoAninhado(atual));
  for (const key of colecoesImportaveis) {
    const map = new Map<string, Record<string, unknown>>();
    for (const r of [...(atual[key] ?? []), ...(recebido[key] ?? [])]) {
      const registro = r as unknown as Record<string, unknown>;
      const identidade = identidadeRegistro(key, registro);
      if (key === "movimentosCaixa" && registro.compra_id !== undefined &&
          registro.situacao === "previsto" && map.get(identidade)?.situacao === "realizado")
        continue;
      map.set(identidade, structuredClone(registro));
    }
    (next as unknown as Record<string, unknown>)[key] = [...map.values()];
  }
  const criadoEm = new Date().toISOString();
  next.importacoes = compactarHistorico([
    { data: atual, criadoEm },
    { data: recebido, criadoEm },
  ]);
  return next;
}
