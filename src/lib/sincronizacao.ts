import { colecoesImportaveis, identidadeRegistro, type ColecaoImportavel } from "./identidade-colecoes";
import type { Database } from "./types";

type Registro = Record<string, unknown>;
const conflito = Symbol("conflito");
const colecoes: ReadonlySet<string> = new Set(colecoesImportaveis);

function objeto(valor: unknown): valor is Registro {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

function iguais(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((valor, i) => iguais(valor, b[i]));
  if (!objeto(a) || !objeto(b)) return false;
  const chaves = Object.keys(a);
  return chaves.length === Object.keys(b).length &&
    chaves.every((chave) => Object.hasOwn(b, chave) && iguais(a[chave], b[chave]));
}

function combinar<T>(base: T, local: T, remoto: T) {
  if (iguais(local, base)) return remoto;
  if (iguais(remoto, base) || iguais(local, remoto)) return local;
  return conflito;
}

function indexar(colecao: ColecaoImportavel, registros?: Registro[]) {
  const indice = new Map<string, Registro>();
  for (const registro of registros ?? []) {
    const chave = identidadeRegistro(colecao, registro);
    if (indice.has(chave)) return null;
    indice.set(chave, registro);
  }
  return indice;
}

export function conciliarDados(base: Database, local: Database, remoto: Database): Database | null {
  const [anterior, minhaCopia, nuvem] = [base, local, remoto] as unknown as Registro[];
  const resultado = Object.create(null) as Registro;
  for (const campo of new Set([...Object.keys(anterior), ...Object.keys(minhaCopia), ...Object.keys(nuvem)])) {
    if (!colecoes.has(campo)) {
      const valor = combinar(anterior[campo], minhaCopia[campo], nuvem[campo]);
      if (valor === conflito) return null;
      if (valor !== undefined) resultado[campo] = valor;
    }
  }
  for (const colecao of colecoesImportaveis) {
    const indiceBase = indexar(colecao, anterior[colecao] as Registro[] | undefined);
    const indiceLocal = indexar(colecao, minhaCopia[colecao] as Registro[] | undefined);
    const indiceRemoto = indexar(colecao, nuvem[colecao] as Registro[] | undefined);
    if (!indiceBase || !indiceLocal || !indiceRemoto) return null;
    if (minhaCopia[colecao] === undefined && nuvem[colecao] === undefined) continue;
    const linhas: Registro[] = [];
    for (const chave of new Set([...indiceRemoto.keys(), ...indiceLocal.keys(), ...indiceBase.keys()])) {
      const valor = combinar(indiceBase.get(chave), indiceLocal.get(chave), indiceRemoto.get(chave));
      if (valor === conflito) return null;
      if (valor !== undefined) linhas.push(valor);
    }
    resultado[colecao] = linhas;
  }
  return resultado as unknown as Database;
}
