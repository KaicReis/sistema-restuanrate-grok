import { v3Schema } from "../validation-v3";
import type { Database } from "../types";
import { migrar } from "./migrate";
import { validarRateio } from "../v2";
import { criarBase } from "./seed";
const KEY = "dna-restaurante:v2";
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= 500;
const num = (v: unknown, max = Number.MAX_SAFE_INTEGER) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;
const money = (v: unknown) => num(v) && Number.isSafeInteger(v);
const unidades = ["kg", "g", "L", "ml", "un"];
const unidadesNaCompraValidas = (v: unknown) =>
  v === undefined || (typeof v === "number" && Number.isSafeInteger(v) && v > 0);
const month = (v: unknown) =>
  typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
export function validarBackup(value: unknown): Database {
  if (!object(value) || ![1, 2].includes(value.version as number))
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
        (i.arquivado !== undefined && typeof i.arquivado !== "boolean") ||
        !unidades.includes(i.unidade) ||
        !unidadesNaCompraValidas(i.unidadesNaCompra) ||
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
        (!p.itens.length && !p.pendente) ||
        p.itens.some(
          (i) =>
            !object(i) ||
            (i.unidade !== undefined && !unidades.includes(i.unidade)) ||
            !num(i.quantidade) ||
            (i.quantidade <= 0 && !i.confirmar) ||
            !num(i.perda) ||
            i.perda >= 100 ||
            !(i.receita_id
              ? (db.receitas ?? []).some(
                  (r) =>
                    r.id === i.receita_id &&
                    r.restaurante_id === p.restaurante_id,
                )
              : db.insumos.some(
                  (s) =>
                    s.id === i.insumo_id &&
                    s.restaurante_id === p.restaurante_id,
                )),
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
  if (db.version === 2) {
    if (!Array.isArray(db.receitas) || !Array.isArray(db.alugueis))
      throw new Error("Coleções v2 ausentes.");
    if (new Set(db.receitas.map((r) => r.id)).size !== db.receitas.length)
      throw new Error("Receita duplicada.");
    const visitar = (id: string, caminho: string[]) => {
      if (caminho.includes(id))
        throw new Error("Referência circular em receita da casa.");
      const r = db.receitas!.find((r) => r.id === id)!;
      if (
        !r ||
        !text(r.nome) ||
        !db.restaurantes.some((x) => x.id === r.restaurante_id) ||
        !num(r.rendimento) ||
        (!r.pendente && r.rendimento <= 0) ||
        !num(r.perda) ||
        r.perda >= 100 ||
        !unidades.includes(r.unidade) ||
        !Array.isArray(r.itens) ||
        (!r.pendente && !r.itens.length)
      )
        throw new Error("Receita da casa inválida.");
      const refs = new Set<string>();
      for (const i of r.itens) {
        const key = i.receita_id || i.insumo_id;
        if (refs.has(key)) throw new Error("Ingrediente duplicado.");
        refs.add(key);
        if (
          (i.unidade !== undefined && !unidades.includes(i.unidade)) ||
          !num(i.quantidade) ||
          (!i.confirmar && i.quantidade <= 0) ||
          !num(i.perda) ||
          i.perda >= 100
        )
          throw new Error("Unidade, quantidade ou perda inválida.");
        if (i.receita_id) {
          if (
            !db.receitas!.some(
              (x) =>
                x.id === i.receita_id && x.restaurante_id === r.restaurante_id,
            )
          )
            throw new Error("Receita de outra operação.");
          visitar(i.receita_id, [...caminho, id]);
        } else if (
          !db.insumos.some(
            (x) =>
              x.id === i.insumo_id && x.restaurante_id === r.restaurante_id,
          )
        )
          throw new Error("Insumo de outra operação.");
      }
    };
    db.receitas.forEach((r) => visitar(r.id, []));
    db.alugueis.forEach((a) => validarRateio(a, db));
    if (
      new Set(db.alugueis.map((a) => a.competencia)).size !== db.alugueis.length
    )
      throw new Error("Aluguel duplicado no mês.");
    for (const i of db.insumos)
      for (const [mes, h] of Object.entries(i.historicoPrecos ?? {}))
        if (
          (mes !== "0000-01" && !month(mes)) ||
          !money(h.preco) ||
          !num(h.quantidade) ||
          h.quantidade <= 0 ||
          !num(h.rendimento, 100) ||
          h.rendimento <= 0 ||
          !unidades.includes(h.unidade) ||
          !unidadesNaCompraValidas(h.unidadesNaCompra)
        )
          throw new Error("Histórico de insumo inválido.");
    for (const d of db.dnas)
      if (
        (d.cmvReal !== undefined && !money(d.cmvReal)) ||
        (d.variaveisReais !== undefined && !money(d.variaveisReais))
      )
        throw new Error("Custos mensais inválidos.");
    for (const p of db.produtos)
      if (
        new Set(
          p.itens.map((i) => `${i.receita_id || i.insumo_id}:${i.canal ?? ""}`),
        ).size !== p.itens.length
      )
        throw new Error("Ingrediente duplicado no mesmo canal.");
  }
  for (const i of db.insumos) {
    if (
      i.conversoes !== undefined &&
      (!Array.isArray(i.conversoes) ||
        i.conversoes.some(
          (c) =>
            !object(c) ||
            !text(c.chave) ||
            !num(c.conteudo) ||
            c.conteudo <= 0 ||
            !unidades.includes(c.unidade),
        ))
    )
      throw new Error("Conversão de fornecedor inválida");
  }
  if (db.combos !== undefined && (
    !Array.isArray(db.combos) || db.combos.length > 10000 ||
    db.combos.some((c) =>
      !object(c) || !text(c.id) || !text(c.nome) || !text(c.canal) ||
      !db.restaurantes.some((r) => r.id === c.restaurante_id) ||
      (c.preco !== undefined && !money(c.preco)) ||
      (c.embalagem !== undefined && !money(c.embalagem)) ||
      !Array.isArray(c.itens) || c.itens.length < 1 || c.itens.length > 50 ||
      c.itens.some((i) => !object(i) || !money(i.quantidade) || i.quantidade < 1 || i.quantidade > 100 ||
        !db.produtos.some((p) => p.id === i.produto_id && p.restaurante_id === c.restaurante_id)) ||
      c.itens.reduce((total, item) => total + item.quantidade, 0) < 2 ||
      new Set(c.itens.map((i) => i.produto_id)).size !== c.itens.length
    ) || new Set(db.combos.map((c) => c.id)).size !== db.combos.length
  )) throw new Error("Combo inválido ou com produto de outra operação.");
  v3Schema.parse(db);
  for (const rows of [
    db.capitais ?? [],
    db.compras ?? [],
    db.saldosCaixa ?? [],
    db.movimentosCaixa ?? [],
    db.fechamentosFinanceiros ?? [],
  ])
    for (const row of rows)
      if (
        !db.restaurantes.some(
          (r) => r.id === row.restaurante_id && r.id !== "a-vila" && !r.grupo,
        )
      )
        throw new Error("Operação v3 inválida");
  if (
    new Set((db.compras ?? []).map((c) => c.id)).size !==
    (db.compras ?? []).length
  )
    throw new Error("Compra duplicada");
  if (
    new Set(
      (db.capitais ?? []).map((c) => c.restaurante_id + ":" + c.competencia),
    ).size !== (db.capitais ?? []).length
  )
    throw new Error("Capital duplicado");
  if (
    new Set((db.movimentosCaixa ?? []).map((m) => m.id)).size !==
    (db.movimentosCaixa ?? []).length
  )
    throw new Error("Movimentação de caixa duplicada.");
  for (const registros of [db.saldosCaixa ?? [], db.fechamentosFinanceiros ?? []])
    if (
      new Set(registros.map((r) => r.restaurante_id + ":" + r.competencia)).size !==
      registros.length
    )
      throw new Error("Registro financeiro mensal duplicado.");
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
    const raw =
      localStorage.getItem(KEY) ?? localStorage.getItem("dna-restaurante:v1");
    if (!raw) return migrar(criarBase());
    try {
      return validarBackup(migrar(validarBackup(JSON.parse(raw))));
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
      if (typeof window !== "undefined")
        window.dispatchEvent(new CustomEvent("vila-save", { detail: db }));
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
    const db = validarBackup(migrar(validarBackup(JSON.parse(json))));
    this.salvar(db);
    return db;
  },
};
