import type { Database } from "./types";

type Importacao = NonNullable<Database["importacoes"]>[number];
export const MAX_IMPORTACOES = 8;
export const MAX_BYTES_IMPORTACOES = 1_500_000;
export const LIMITE_BYTES_SINCRONIZACAO = 4_000_000;
const encoder = new TextEncoder();

function objeto(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

export function semHistoricoAninhado<T>(dados: T): T {
  if (!objeto(dados)) return dados;
  const legado = dados.legadoV1;
  const legadoAninhado = objeto(legado) && Object.hasOwn(legado, "importacoes");
  if (!Object.hasOwn(dados, "importacoes") && !legadoAninhado) return dados;
  const copia: Record<string, unknown> = { ...dados };
  delete copia.importacoes;
  if (legadoAninhado) {
    const copiaLegado = { ...legado };
    delete copiaLegado.importacoes;
    copia.legadoV1 = copiaLegado;
  }
  return copia as T;
}

function historicoLegado(dados: unknown): unknown[] {
  return objeto(dados) && objeto(dados.legadoV1) && Array.isArray(dados.legadoV1.importacoes)
    ? dados.legadoV1.importacoes : [];
}

// A representação canônica identifica cópias iguais, inclusive após gravar em JSONB.
function chaveDeConteudo(dados: unknown): string | undefined {
  return JSON.stringify(dados, (_, valor: unknown) =>
    objeto(valor) ? Object.fromEntries(Object.keys(valor).sort().map((chave) =>
      [chave, valor[chave]])) : valor,
  );
}

export function compactarHistorico(importacoes: unknown[], limiteBytes = MAX_BYTES_IMPORTACOES): Importacao[] {
  const pilha: unknown[] = [...importacoes];
  const entradas: Importacao[] = [];
  const visitados = new WeakSet<object>();
  while (pilha.length) {
    const entrada = pilha.pop();
    if (!objeto(entrada) || !Object.hasOwn(entrada, "data") ||
        typeof entrada.criadoEm !== "string" || visitados.has(entrada)) continue;
    visitados.add(entrada);
    const { data, criadoEm } = entrada;
    entradas.push({ data: semHistoricoAninhado(data), criadoEm });
    if (objeto(data) && Array.isArray(data.importacoes)) {
      for (const anterior of data.importacoes) pilha.push(anterior);
    }
    for (const anterior of historicoLegado(data)) pilha.push(anterior);
  }

  // Arquivos legados usam a mesma data ISO. Empates seguem a ordem mais recente de entrada.
  entradas.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  const vistos = new Set<string>();
  const recentes: Importacao[] = [];
  let bytes = 2; // colchetes da lista JSON
  for (const entrada of entradas) {
    if (recentes.length === MAX_IMPORTACOES) break;
    const chave = chaveDeConteudo(entrada.data);
    if (chave === undefined || vistos.has(chave)) continue;
    const tamanho = encoder.encode(JSON.stringify({ data: entrada.data, criadoEm: entrada.criadoEm })).length;
    if (bytes + tamanho + Number(recentes.length > 0) > limiteBytes) continue;
    vistos.add(chave);
    recentes.push({ ...entrada, data: JSON.parse(chave) });
    bytes += tamanho + Number(recentes.length > 1);
  }
  return recentes.reverse();
}

export function compactarBackup(dados: Database): Database {
  const legado = historicoLegado(dados);
  if (!dados.importacoes?.length && !legado.length) return dados;
  const ativo = semHistoricoAninhado(dados);
  const tamanhoAtivo = encoder.encode(JSON.stringify(ativo)).byteLength;
  const limiteHistorico = Math.min(MAX_BYTES_IMPORTACOES, LIMITE_BYTES_SINCRONIZACAO - tamanhoAtivo - 256);
  return {
    ...ativo,
    importacoes: limiteHistorico > 2 ? compactarHistorico([...(dados.importacoes ?? []), ...legado], limiteHistorico) : [],
  };
}
