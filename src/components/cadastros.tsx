"use client";
import { Numeric } from "./numeric";
import { useState } from "react";
import { Building2, Pencil, Plus, Store, Trash2 } from "lucide-react";
import { dinheiro, paraCentavos, taxaCanal, percentual } from "@/lib/dna";
import { novosCanais, novoDNA } from "@/lib/storage/seed";
import type { Canal, Restaurante, Taxa } from "@/lib/types";
import { useSistema } from "./context";
import { AddButton, Empty, Field, Modal, Money, Panel, formString } from "./ui";
export function Restaurantes() {
  const { db, restaurante, mes, atualizar, selecionar } = useSistema(),
    [edit, setEdit] = useState<Restaurante | "new" | null>(null);
  const record = edit && edit !== "new" ? edit : null;
  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget),
      novo: Restaurante = {
        id: record?.id ?? crypto.randomUUID(),
        nome: formString(data, "nome"),
        regime: formString(data, "regime") as Restaurante["regime"],
      };
    if (
      atualizar((draft) => {
        if (record)
          draft.restaurantes = draft.restaurantes.map((r) =>
            r.id === record.id ? novo : r,
          );
        else {
          draft.restaurantes.push(novo);
          draft.dnas.push(novoDNA(novo.id, mes));
          draft.canais.push(...novosCanais(novo.id, mes));
        }
      }, "Restaurante salvo.")
    )
      setEdit(null);
  }
  return (
    <>
      <div className="section-toolbar">
        <p className="muted">Dados financeiros isolados por operação.</p>
        <AddButton onClick={() => setEdit("new")}>Novo restaurante</AddButton>
      </div>
      <div className="restaurant-grid">
        {db.restaurantes.map((r) => (
          <section
            key={r.id}
            className={`restaurant-card ${r.id === restaurante.id ? "selected" : ""}`}
          >
            <div className="restaurant-card-top">
              <span className="restaurant-icon">
                <Building2 />
              </span>
              {r.id === restaurante.id && (
                <span className="pill">Selecionado</span>
              )}
            </div>
            <h2>{r.nome}</h2>
            <p>Regime tributário: {r.regime}</p>
            <div className="restaurant-counts">
              <span>
                {db.insumos.filter((i) => i.restaurante_id === r.id).length}{" "}
                insumos
              </span>
              <span>
                {db.produtos.filter((p) => p.restaurante_id === r.id).length}{" "}
                fichas técnicas
              </span>
            </div>
            <div className="card-actions">
              <button className="button" onClick={() => setEdit(r)}>
                <Pencil size={16} />
                Editar
              </button>
              <button
                className="button primary"
                disabled={r.id === restaurante.id}
                onClick={() => selecionar(r.id)}
              >
                Selecionar
              </button>
            </div>
          </section>
        ))}
      </div>
      {edit && (
        <Modal
          title={record ? "Editar restaurante" : "Novo restaurante"}
          close={() => setEdit(null)}
        >
          <form onSubmit={save}>
            <Field label="Nome do restaurante">
              <input
                name="nome"
                required
                maxLength={80}
                autoFocus
                defaultValue={record?.nome}
                placeholder="Como sua operação se chama?"
              />
            </Field>
            <Field label="Regime tributário">
              <select name="regime" defaultValue={record?.regime ?? "Simples"}>
                <option>MEI</option>
                <option>Simples</option>
                <option>Outro</option>
              </select>
            </Field>
            <div className="notice">
              A alíquota efetiva é definida no DNA mensal, independentemente do
              regime.
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="button"
                onClick={() => setEdit(null)}
              >
                Cancelar
              </button>
              <button className="button primary">Salvar restaurante</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Canais() {
  const { db, restaurante, mes, atualizar } = useSistema(),
    [edit, setEdit] = useState<Canal | "new" | null>(null);
  const canais = db.canais.filter(
    (c) => c.restaurante_id === restaurante.id && c.competencia === mes,
  );
  return (
    <>
      <div className="section-toolbar">
        <p className="muted">
          Taxas e preços por canal são específicos de cada competência.
        </p>
        <AddButton onClick={() => setEdit("new")}>Novo canal</AddButton>
      </div>
      <div className="notice">
        A embalagem do canal <strong>substitui</strong> a embalagem base da
        ficha. Deixe em branco para usar a base; informe R$ 0,00 para não usar
        embalagem.
      </div>
      <div className="channel-grid">
        {canais.map((c) => (
          <Panel
            key={c.id}
            title={c.nome}
            action={
              <button
                className="icon-button"
                aria-label={`Editar canal ${c.nome}`}
                onClick={() => setEdit(c)}
              >
                <Pencil size={18} />
              </button>
            }
          >
            <div className="channel-rate">
              <Store size={24} />
              <strong>{percentual(taxaCanal(c))}</strong>
              <span>de custos variáveis</span>
            </div>
            <div className="detail-list">
              {c.taxas.map((t) => (
                <div key={t.id}>
                  <span>{t.descricao}</span>
                  <strong>{percentual(t.percentual / 100)}</strong>
                </div>
              ))}
              {!c.taxas.length && (
                <p className="muted">Nenhuma taxa cadastrada.</p>
              )}
              <div>
                <span>Custo fixo por unidade</span>
                <strong>{dinheiro(c.custoUnidade)}</strong>
              </div>
              <div>
                <span>Embalagem</span>
                <strong>
                  {c.embalagem === null
                    ? "Base da ficha"
                    : dinheiro(c.embalagem)}
                </strong>
              </div>
            </div>
          </Panel>
        ))}
      </div>
      {!canais.length && (
        <Empty
          title="Cadastre um canal de venda"
          description="Separe salão, retirada, delivery e aplicativos."
        />
      )}
      {edit && (
        <CanalModal
          canal={edit === "new" ? null : edit}
          close={() => setEdit(null)}
          save={(canal) => {
            if (
              atualizar((draft) => {
                const i = draft.canais.findIndex((c) => c.id === canal.id);
                if (i < 0) draft.canais.push(canal);
                else draft.canais[i] = canal;
              })
            )
              setEdit(null);
          }}
        />
      )}
    </>
  );
}
function CanalModal({
  canal,
  close,
  save,
}: {
  canal: Canal | null;
  close: () => void;
  save: (canal: Canal) => void;
}) {
  const { restaurante, mes } = useSistema(),
    [taxas, setTaxas] = useState<Taxa[]>(structuredClone(canal?.taxas ?? []));
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      embalagem = formString(f, "embalagem");
    save({
      id: canal?.id ?? crypto.randomUUID(),
      restaurante_id: restaurante.id,
      competencia: mes,
      nome: formString(f, "nome"),
      custoUnidade: paraCentavos(formString(f, "custo")),
      embalagem: embalagem === "" ? null : paraCentavos(embalagem),
      taxas,
    });
  }
  return (
    <Modal title={canal ? "Editar canal" : "Novo canal"} close={close}>
      <form onSubmit={submit}>
        <Field label="Nome do canal">
          <input
            required
            name="nome"
            maxLength={80}
            defaultValue={canal?.nome}
          />
        </Field>
        <div className="form-grid">
          <Field label="Custo fixo por unidade (R$)">
            <Money name="custo" value={canal?.custoUnidade} />
          </Field>
          <Field
            label="Embalagem do canal (R$)"
            hint="Em branco: usar embalagem base da ficha."
          >
            <Numeric
              name="embalagem"
              type="number"
              min="0"
              step="0.01"
              defaultValue={
                canal?.embalagem === null
                  ? ""
                  : canal?.embalagem === undefined
                    ? ""
                    : canal.embalagem / 100
              }
              placeholder="Usar base da ficha"
            />
          </Field>
        </div>
        <h3 className="form-subtitle">Custos variáveis</h3>
        {taxas.map((t, idx) => (
          <div className="rate-row" key={t.id}>
            <Field label="Descrição">
              <input
                required
                maxLength={100}
                value={t.descricao}
                onChange={(e) =>
                  setTaxas((rows) =>
                    rows.map((r, i) =>
                      i === idx ? { ...r, descricao: e.target.value } : r,
                    ),
                  )
                }
                placeholder="Cartão, comissão…"
              />
            </Field>
            <Field label="Taxa (%)">
              <Numeric
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                value={t.percentual}
                onChange={(e) =>
                  setTaxas((rows) =>
                    rows.map((r, i) =>
                      i === idx
                        ? { ...r, percentual: Number(e.target.value) }
                        : r,
                    ),
                  )
                }
              />
            </Field>
            <button
              type="button"
              className="icon-button danger"
              aria-label={`Remover taxa ${t.descricao}`}
              onClick={() => {
                if (confirm("Excluir esta taxa?"))
                  setTaxas((rows) => rows.filter((r) => r.id !== t.id));
              }}
            >
              <Trash2 size={18} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="button"
          onClick={() =>
            setTaxas((rows) => [
              ...rows,
              { id: crypto.randomUUID(), descricao: "", percentual: 0 },
            ])
          }
        >
          <Plus size={16} />
          Adicionar taxa
        </button>
        <div className="form-actions">
          <button type="button" className="button" onClick={close}>
            Cancelar
          </button>
          <button className="button primary">Salvar canal</button>
        </div>
      </form>
    </Modal>
  );
}
