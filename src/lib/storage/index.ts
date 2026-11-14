import type { Database } from "../types";
import { criarBase } from "./seed";
const KEY = "dna-restaurante:v1";
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= 500;
const num = (v: unknown, max = Number.MAX_SAFE_INTEGER) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;
const money = (v: unknown) => num(v) && Number.isSafeInteger(v);
const month = (v: unknown) =>
  typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
export function validarBackup(value: unknown): Database {
  if (!object(value) || value.version !== 1)
    throw new Error("Backup inválido ou versão não suportada.");
  const collections = [
    "restaurantes",
    "dnas",
    "canais",
    "insumos",
    "produtos",
    "precos",
  ] as const;
  for (const key of collections) {
    const rows = value[key];
    if (
      !Array.isArray(rows) ||
      rows.length > 100000 ||
      rows.some((r) => !object(r) || !text(r.id)) ||
      new Set(rows.map((r) => r.id)).size !== rows.length
    )
      throw new Error(`Lista inválida no backup: ${key}.`);
  }
  const db = value as unknown as Database;
  if (
    !db.restaurantes.length ||
    db.restaurantes.some(
      (r) => !text(r.nome) || !["MEI", "Simples", "Outro"].includes(r.regime),
    )
  )
    throw new Error("Restaurantes inválidos no backup.");
  for (const key of collections.filter((k) => k !== "restaurantes"))
    for (const row of db[key])
      if (!db.restaurantes.some((r) => r.id === row.restaurante_id))
        throw new Error("Registro sem restaurante válido.");
  if (
    db.dnas.some(
      (d) =>
        !month(d.competencia) ||
        !money(d.faturamento) ||
        !["meta", "realizado"].includes(d.tipoFaturamento) ||
        !num(d.imposto, 100) ||
        !num(d.margem, 100) ||
        !Array.isArray(d.fixos) ||
        d.fixos.some(
          (f) =>
            !object(f) ||
            !text(f.id) ||
            !text(f.categoria) ||
            !text(f.descricao) ||
            !money(f.valor) ||
            !["operacional", "amortizacao", "outro"].includes(f.natureza),
        ),
    )
  )
    throw new Error("DNA inválido no backup.");
  if (
    new Set(db.dnas.map((d) => `${d.restaurante_id}:${d.competencia}`)).size !==
    db.dnas.length
  )
    throw new Error("DNA duplicado para a mesma competência.");
  if (
    db.canais.some(
      (c) =>
        !month(c.competencia) ||
        !text(c.nome) ||
        !money(c.custoUnidade) ||
        (c.embalagem !== null && !money(c.embalagem)) ||
        !Array.isArray(c.taxas) ||
        c.taxas.some(
          (t) =>
            !object(t) ||
            !text(t.id) ||
            !text(t.descricao) ||
            !num(t.percentual, 100),
        ),
    )
  )
    throw new Error("Canal inválido no backup.");
  if (
    db.insumos.some(
      (i) =>
        !text(i.nome) ||
        !["kg", "g", "L", "ml", "un"].includes(i.unidade) ||
        !num(i.quantidade) ||
        i.quantidade <= 0 ||
        !money(i.preco) ||
        !num(i.rendimento, 100) ||
        i.rendimento <= 0,
    )
  )
    throw new Error("Insumo inválido no backup.");
  if (
    db.produtos.some(
      (p) =>
        !text(p.nome) ||
        !num(p.rendimento) ||
        p.rendimento <= 0 ||
        !money(p.embalagem) ||
        !Array.isArray(p.itens) ||
        !p.itens.length ||
        p.itens.some(
          (i) =>
            !object(i) ||
            !num(i.quantidade) ||
            i.quantidade <= 0 ||
            !num(i.perda) ||
            i.perda >= 100 ||
            !db.insumos.some(
              (s) =>
                s.id === i.insumo_id && s.restaurante_id === p.restaurante_id,
            ),
        ),
    )
  )
    throw new Error(
      "Ficha técnica inválida ou com insumo de outro restaurante.",
    );
  if (
    db.precos.some(
      (p) =>
        !money(p.valor) ||
        !db.produtos.some(
          (x) => x.id === p.produto_id && x.restaurante_id === p.restaurante_id,
        ) ||
        !db.canais.some(
          (x) => x.id === p.canal_id && x.restaurante_id === p.restaurante_id,
        ),
    )
  )
    throw new Error("Preço sem produto ou canal válido.");
  if (
    new Set(db.precos.map((p) => `${p.produto_id}:${p.canal_id}`)).size !==
    db.precos.length
  )
    throw new Error("Preço duplicado para o mesmo produto e canal.");
  return db;
}
export interface Repositorio {
  carregar(): Database;
  salvar(db: Database): void;
  exportar(): string;
  importar(json: string): Database;
}
// Somente este módulo conhece localStorage. Uma implementação Postgres pode manter o mesmo contrato.
export const repositorio: Repositorio = {
  carregar() {
    const raw = localStorage.getItem(KEY);
    if (!raw) return criarBase();
    try {
      return validarBackup(JSON.parse(raw));
    } catch {
      throw new Error(
        "Não foi possível ler os dados locais. Eles foram preservados. Importe um backup válido para recuperar.",
      );
    }
  },
  salvar(db) {
    validarBackup(db);
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {
      throw new Error(
        "Não foi possível salvar no navegador. Verifique o espaço disponível e as permissões de armazenamento.",
      );
    }
  },
  exportar() {
    return JSON.stringify(validarBackup(this.carregar()), null, 2);
  },
  importar(json) {
    const db = validarBackup(JSON.parse(json));
    this.salvar(db);
    return db;
  },
};
