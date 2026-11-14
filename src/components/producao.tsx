"use client";
import { useState } from "react";
import type {
  Insumo,
  ItemFicha,
  Produto,
  ReceitaCasa,
  Unidade,
} from "@/lib/types";
import {
  calcularCMV,
  custoReceita,
  dinheiro,
  paraCentavos,
  unidadeUso,
} from "@/lib/dna";
import { insumosMes } from "@/lib/v2";
import { useSistema } from "./context";
import {
  AddButton,
  Field,
  Modal,
  Money,
  Panel,
  formNumber,
  formString,
} from "./ui";
import { Numeric } from "./numeric";
export function Insumos() {
  const { db, restaurante, mes, atualizar, avisar } = useSistema();
  const [edit, setEdit] = useState<Insumo | "new" | null>(null),
    [busca, setBusca] = useState(""),
    [error, setError] = useState("");
  const rows = insumosMes(db, mes).filter(
      (i) => i.restaurante_id === restaurante.id,
    ),
    record = edit && edit !== "new" ? edit : null;
  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      if (!formString(f, "nome"))
        throw new Error("Nome: informe o nome do insumo.");
      const snapshot = {
        preco: paraCentavos(formString(f, "preco")),
        quantidade: formNumber(f, "quantidade"),
        unidade: formString(f, "unidade") as Unidade,
        rendimento: formNumber(f, "rendimento"),
        precoPendente: formString(f, "preco") === "",
      };
      if (
        snapshot.quantidade <= 0 ||
        snapshot.rendimento <= 0 ||
        snapshot.rendimento > 100
      )
        throw new Error(
          "Quantidade deve ser positiva e rendimento entre 0 e 100%.",
        );
      if (
        atualizar((d) => {
          const original = d.insumos.find((i) => i.id === record?.id);
          const i: Insumo = {
            ...original,
            ...snapshot,
            id: record?.id ?? crypto.randomUUID(),
            restaurante_id: restaurante.id,
            nome: formString(f, "nome"),
            historicoPrecos: { ...original?.historicoPrecos, [mes]: snapshot },
          };
          if (original) d.insumos[d.insumos.indexOf(original)] = i;
          else d.insumos.push(i);
        }, "Insumo salvo nesta competência. Meses anteriores preservados.")
      )
        setEdit(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="section-toolbar">
        <input
          aria-label="Buscar insumo"
          placeholder="Buscar insumo…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <AddButton
          onClick={() => {
            setError("");
            setEdit("new");
          }}
        >
          Novo insumo
        </AddButton>
      </div>
      <div className="notice">
        Preços e condições de compra são guardados por mês. Preço em branco
        significa pendente. VM e VG são tamanhos com custos independentes.
        Embalagens devem entrar na ficha OU no custo do canal.
      </div>
      <Panel
        title="Insumos da operação"
        subtitle={`${rows.filter((i) => i.precoPendente).length} preços pendentes`}
      >
        {rows
          .filter((i) =>
            i.nome.toLocaleLowerCase().includes(busca.toLocaleLowerCase()),
          )
          .map((i) => (
            <div className="ingredient-row" key={i.id}>
              <div className="ingredient-name">
                <strong>{i.nome}</strong>
                <small>
                  {i.quantidade.toLocaleString("pt-BR")} {i.unidade} ·{" "}
                  {i.rendimento.toLocaleString("pt-BR")}% aproveitável
                </small>
              </div>
              <strong className={i.precoPendente ? "negative" : ""}>
                {i.precoPendente ? "Preço pendente" : dinheiro(i.preco)}
              </strong>
              <button
                className="button"
                onClick={() => {
                  setError("");
                  setEdit(i);
                }}
              >
                Editar / histórico
              </button>
            </div>
          ))}
      </Panel>
      {edit && (
        <Modal
          title={record ? "Editar insumo" : "Novo insumo"}
          close={() => setEdit(null)}
        >
          <form
            onSubmit={save}
            onInvalid={() =>
              setError(
                "Confira os campos destacados: nome, quantidade e rendimento são obrigatórios.",
              )
            }
          >
            {error && (
              <p role="alert" className="negative">
                {error}
              </p>
            )}
            <Field label="Nome">
              <input name="nome" required defaultValue={record?.nome} />
            </Field>
            <div className="form-grid">
              <Field label="Unidade de compra">
                <select name="unidade" defaultValue={record?.unidade ?? "kg"}>
                  {["kg", "g", "L", "ml", "un"].map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </Field>
              <Field label="Quantidade da compra">
                <Numeric
                  name="quantidade"
                  min="0.000001"
                  required
                  defaultValue={record?.quantidade ?? 1}
                />
              </Field>
              <Field label="Preço pago (R$), em branco = pendente">
                <input
                  name="preco"
                  inputMode="decimal"
                  defaultValue={
                    record && !record.precoPendente
                      ? (record.preco / 100).toFixed(2).replace(".", ",")
                      : ""
                  }
                />
              </Field>
              <Field label="Rendimento aproveitável (%)">
                <Numeric
                  name="rendimento"
                  min="0.000001"
                  max="100"
                  required
                  defaultValue={record?.rendimento ?? 100}
                />
              </Field>
            </div>
            {record && (
              <Panel title="Histórico por competência">
                {Object.entries(record.historicoPrecos ?? {})
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([m, h]) => (
                    <p key={m}>
                      {m === "0000-01"
                        ? "Base migrada da v1"
                        : m.split("-").reverse().join("/")}{" "}
                      · {h.precoPendente ? "Preço pendente" : dinheiro(h.preco)}{" "}
                      · {h.quantidade.toLocaleString("pt-BR")} {h.unidade}
                    </p>
                  ))}
              </Panel>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="button danger"
                onClick={() => {
                  if (!record || !confirm("Excluir este insumo?")) return;
                  if (
                    db.produtos.some((p) =>
                      p.itens.some((x) => x.insumo_id === record.id),
                    ) ||
                    db.receitas?.some((p) =>
                      p.itens.some((x) => x.insumo_id === record.id),
                    )
                  ) {
                    avisar("Insumo em uso. Remova das fichas primeiro.");
                    return;
                  }
                  if (
                    atualizar((d) => {
                      d.insumos = d.insumos.filter((i) => i.id !== record.id);
                    })
                  )
                    setEdit(null);
                }}
              >
                Excluir insumo
              </button>
              <button className="button primary">Salvar insumo</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Fichas() {
  return <Preparos casa={false} />;
}
export function Receitas() {
  return <Preparos casa />;
}
function Preparos({ casa }: { casa: boolean }) {
  const { db, restaurante, mes, atualizar } = useSistema();
  const [edit, setEdit] = useState<Produto | ReceitaCasa | "new" | null>(null),
    [busca, setBusca] = useState("");
  const rows = (casa ? (db.receitas ?? []) : db.produtos).filter(
      (p) => p.restaurante_id === restaurante.id,
    ),
    insumos = insumosMes(db, mes);
  return (
    <>
      <div className="section-toolbar">
        <input
          aria-label="Buscar preparo"
          placeholder="Buscar…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <AddButton onClick={() => setEdit("new")}>
          {casa ? "Nova receita da casa" : "Nova ficha técnica"}
        </AddButton>
      </div>
      <div className="notice">
        {casa
          ? "Preparo feito na casa: rendimento em g, ml ou un. Composição sugerida precisa de confirmação. Comprados prontos ficam nos insumos."
          : "Itens em g, ml ou un. Use “Todos os canais” para a base e “Salão” para cortesias. Embalagens: use ingredientes OU o valor separado, nunca os dois."}
      </div>
      <div className="recipe-grid">
        {rows
          .filter((p) => p.nome.toLowerCase().includes(busca.toLowerCase()))
          .map((p) => {
            let custo: string;
            try {
              custo = dinheiro(
                casa
                  ? custoReceita(p as ReceitaCasa, insumos, db.receitas ?? [])
                  : calcularCMV(
                      {
                        ...p,
                        itens: p.itens.filter((i) => !i.canal),
                      } as Produto,
                      insumos,
                      db.receitas,
                    ),
              );
            } catch {
              custo = "Pendente: confirmar ficha, quantidades e preços";
            }
            return (
              <Panel
                key={p.id}
                title={p.nome}
                action={
                  <button className="button" onClick={() => setEdit(p)}>
                    Editar
                  </button>
                }
              >
                <p>
                  {custo}
                  {casa
                    ? " / unidade de uso"
                    : " · base comum (cortesias por canal na precificação)"}
                </p>
                {"precoCardapio" in p && p.precoCardapio !== undefined && (
                  <p>Preço do PDF · Salão: {dinheiro(p.precoCardapio)}</p>
                )}
                <p className="muted">{p.notas}</p>
                <p>
                  {p.itens.length} itens ·{" "}
                  {p.pendente ? "Ficha pendente" : "Composição confirmada"}
                </p>
              </Panel>
            );
          })}
      </div>
      {edit && (
        <PreparoModal
          casa={casa}
          record={edit === "new" ? null : edit}
          close={() => setEdit(null)}
          save={(p) => {
            if (
              atualizar((d) => {
                if (casa) {
                  d.receitas ??= [];
                  const idx = d.receitas.findIndex((r) => r.id === p.id);
                  if (idx < 0) d.receitas.push(p as ReceitaCasa);
                  else d.receitas[idx] = p as ReceitaCasa;
                } else {
                  const idx = d.produtos.findIndex((r) => r.id === p.id);
                  if (idx < 0) d.produtos.push(p as Produto);
                  else d.produtos[idx] = p as Produto;
                }
              }, "Ficha salva. Custos propagados.")
            )
              setEdit(null);
          }}
          remove={() => {
            if (!confirm("Excluir este preparo?")) return;
            if (
              atualizar((d) => {
                if (casa) {
                  if (
                    d.receitas?.some((r) =>
                      r.itens.some(
                        (i) => i.receita_id === (edit as ReceitaCasa).id,
                      ),
                    ) ||
                    d.produtos.some((r) =>
                      r.itens.some(
                        (i) => i.receita_id === (edit as ReceitaCasa).id,
                      ),
                    )
                  )
                    throw new Error("Receita em uso em outra ficha.");
                  d.receitas = d.receitas?.filter(
                    (r) => r.id !== (edit as ReceitaCasa).id,
                  );
                } else {
                  d.produtos = d.produtos.filter(
                    (r) => r.id !== (edit as Produto).id,
                  );
                  d.precos = d.precos.filter(
                    (p) => p.produto_id !== (edit as Produto).id,
                  );
                }
              })
            )
              setEdit(null);
          }}
        />
      )}
    </>
  );
}
function PreparoModal({
  casa,
  record,
  close,
  save,
  remove,
}: {
  casa: boolean;
  record: Produto | ReceitaCasa | null;
  close: () => void;
  save: (p: Produto | ReceitaCasa) => void;
  remove: () => void;
}) {
  const { db, restaurante, mes } = useSistema(),
    [itens, setItens] = useState<ItemFicha[]>(
      structuredClone(record?.itens ?? []),
    ),
    [busca, setBusca] = useState(""),
    [error, setError] = useState("");
  const insumos = insumosMes(db, mes).filter(
      (i) => i.restaurante_id === restaurante.id,
    ),
    receitas = (db.receitas ?? []).filter(
      (r) => r.restaurante_id === restaurante.id && r.id !== record?.id,
    );
  const options = [
    ...insumos.map((i) => ({
      id: i.id,
      nome: i.nome,
      unidade: unidadeUso(i),
      receita: false,
    })),
    ...receitas.map((r) => ({
      id: r.id,
      nome: r.nome,
      unidade: unidadeUso({ unidade: r.unidade } as Insumo),
      receita: true,
    })),
  ];
  function change(idx: number, patch: Partial<ItemFicha>) {
    setItens((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    );
  }
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      const f = new FormData(e.currentTarget);
      if (!formString(f, "nome")) throw new Error("Informe o nome.");
      if (
        !itens.length ||
        itens.some((i) => (!i.insumo_id && !i.receita_id) || i.quantidade <= 0)
      )
        throw new Error("Escolha cada item e informe quantidades positivas.");
      const p = {
        ...record,
        id: record?.id ?? crypto.randomUUID(),
        restaurante_id: restaurante.id,
        nome: formString(f, "nome"),
        rendimento: formNumber(f, "rendimento"),
        itens: itens.map((i) => ({ ...i, confirmar: false })),
        pendente: false,
        notas: formString(f, "notas"),
      };
      if (casa)
        save({
          ...p,
          unidade: formString(f, "unidade") as Unidade,
          perda: formNumber(f, "perda"),
        });
      else save({ ...p, embalagem: paraCentavos(formString(f, "embalagem")) });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal
      title={casa ? "Receita da casa" : "Ficha técnica do prato"}
      close={close}
    >
      <form onSubmit={submit}>
        {error && (
          <p role="alert" className="negative">
            {error}
          </p>
        )}
        <Field label="Nome">
          <input name="nome" required defaultValue={record?.nome} />
        </Field>
        <div className="form-grid">
          <Field
            label={casa ? "Rendimento produzido" : "Rendimento em porções"}
          >
            <Numeric
              name="rendimento"
              min="0.000001"
              required
              defaultValue={record?.rendimento ?? 1}
            />
          </Field>
          {casa ? (
            <>
              <Field label="Unidade de rendimento">
                <select
                  name="unidade"
                  defaultValue={(record as ReceitaCasa)?.unidade ?? "g"}
                >
                  {["g", "kg", "ml", "L", "un"].map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </Field>
              <Field label="Perda do preparo (%)">
                <Numeric
                  name="perda"
                  required
                  min="0"
                  max="99.9999"
                  defaultValue={(record as ReceitaCasa)?.perda ?? 0}
                />
              </Field>
            </>
          ) : (
            <Field label="Embalagem separada por porção (R$)">
              <Money
                name="embalagem"
                value={(record as Produto)?.embalagem ?? 0}
              />
            </Field>
          )}
        </div>
        <Field label="Buscar insumo ou receita">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Digite para filtrar os itens…"
          />
        </Field>
        {itens.map((item, idx) => {
          const selected = item.receita_id || item.insumo_id;
          const o = options.find((o) => o.id === selected);
          return (
            <div className="recipe-item" key={idx}>
              <Field label="Insumo ou receita">
                <select
                  required
                  value={selected}
                  onChange={(e) => {
                    const o = options.find((o) => o.id === e.target.value)!;
                    change(idx, {
                      insumo_id: o.receita ? "" : o.id,
                      receita_id: o.receita ? o.id : undefined,
                    });
                  }}
                >
                  <option value="">Selecione um item</option>
                  {options
                    .filter(
                      (o) =>
                        (o.id === selected ||
                          o.nome.toLowerCase().includes(busca.toLowerCase())) &&
                        !itens.some(
                          (r, i) =>
                            i !== idx &&
                            (r.receita_id || r.insumo_id) === o.id &&
                            (r.canal ?? "") === (item.canal ?? ""),
                        ),
                    )
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.receita ? "Receita: " : ""}
                        {o.nome} ({o.unidade})
                      </option>
                    ))}
                </select>
              </Field>
              <Field
                label={`Quantidade (${o?.unidade ?? "unidade"})${item.confirmar ? " · confirmar" : ""}`}
              >
                <Numeric
                  required
                  min="0.000001"
                  value={item.quantidade}
                  onChange={(e) =>
                    change(idx, {
                      quantidade: Number(e.target.value),
                      confirmar: false,
                    })
                  }
                />
              </Field>
              <Field label="Perda adicional (%)">
                <Numeric
                  min="0"
                  max="99.9999"
                  required
                  value={item.perda}
                  onChange={(e) =>
                    change(idx, { perda: Number(e.target.value) })
                  }
                />
              </Field>
              {!casa && (
                <Field label="Aplicação no canal">
                  <select
                    value={item.canal ?? ""}
                    onChange={(e) =>
                      change(idx, { canal: e.target.value || undefined })
                    }
                  >
                    <option value="">Todos os canais</option>
                    {Array.from(
                      new Set(
                        db.canais
                          .filter(
                            (c) =>
                              c.restaurante_id === restaurante.id &&
                              c.competencia === mes,
                          )
                          .map((c) => c.nome),
                      ),
                    ).map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </Field>
              )}
              <button
                type="button"
                className="button danger"
                onClick={() => {
                  if (confirm("Remover este item da ficha?"))
                    setItens((rows) => rows.filter((_, i) => i !== idx));
                }}
              >
                Remover
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="button"
          onClick={() =>
            setItens((rows) => [
              ...rows,
              { insumo_id: "", quantidade: 0, perda: 0 },
            ])
          }
        >
          Adicionar item
        </button>
        <Field label="Notas e pendências">
          <textarea name="notas" defaultValue={record?.notas} />
        </Field>
        <div className="form-actions">
          {record && (
            <button type="button" className="button danger" onClick={remove}>
              Excluir
            </button>
          )}
          <button type="button" className="button" onClick={close}>
            Cancelar
          </button>
          <button className="button primary">
            Salvar e confirmar composição
          </button>
        </div>
      </form>
    </Modal>
  );
}
