"use client";
import { useState } from "react";
import {
  ArrowRight,
  FlaskConical,
  NotebookPen,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import type { Insumo, ItemFicha, Produto } from "@/lib/types";
import {
  calcularCMV,
  custoUnidadeUso,
  dinheiro,
  paraCentavos,
  unidadeUso,
} from "@/lib/dna";
import { useSistema } from "./context";
import {
  AddButton,
  Empty,
  Field,
  Modal,
  Money,
  Panel,
  formNumber,
  formString,
} from "./ui";
export function Insumos() {
  const { db, restaurante, atualizar, avisar } = useSistema(),
    [edit, setEdit] = useState<Insumo | "new" | null>(null),
    [search, setSearch] = useState(""),
    [sample, setSample] = useState(false);
  const all = db.insumos.filter((i) => i.restaurante_id === restaurante.id),
    rows = all.filter((i) =>
      i.nome
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")),
    ),
    record = edit && edit !== "new" ? edit : null;
  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      insumo: Insumo = {
        id: record?.id ?? crypto.randomUUID(),
        restaurante_id: restaurante.id,
        nome: formString(f, "nome"),
        unidade: formString(f, "unidade") as Insumo["unidade"],
        quantidade: formNumber(f, "quantidade"),
        preco: paraCentavos(formString(f, "preco")),
        rendimento: formNumber(f, "rendimento"),
      };
    if (
      atualizar((draft) => {
        const i = draft.insumos.findIndex((x) => x.id === insumo.id);
        if (i < 0) draft.insumos.push(insumo);
        else draft.insumos[i] = insumo;
      }, "Insumo salvo. Os custos das fichas foram recalculados.")
    )
      setEdit(null);
  }
  function seedBora() {
    if (all.length) {
      avisar(
        "A demonstração só pode ser carregada com a lista de insumos vazia.",
      );
      return;
    }
    if (
      atualizar((draft) => {
        draft.insumos.push(
          ...[
            {
              nome: "Pão brioche · exemplo abr/2025",
              unidade: "un" as const,
              quantidade: 1,
              preco: 200,
            },
            {
              nome: "Blend bovino · exemplo abr/2025",
              unidade: "kg" as const,
              quantidade: 1,
              preco: 5000,
            },
            {
              nome: "Mussarela · exemplo abr/2025",
              unidade: "kg" as const,
              quantidade: 1,
              preco: 3300,
            },
            {
              nome: "Embalagem · exemplo abr/2025",
              unidade: "un" as const,
              quantidade: 1,
              preco: 200,
            },
          ].map((i) => ({
            ...i,
            id: crypto.randomUUID(),
            restaurante_id: restaurante.id,
            rendimento: 100,
          })),
        );
      }, "Exemplos históricos abr/2025 carregados. Revise os preços atuais.")
    )
      setSample(false);
  }
  return (
    <>
      <div className="section-toolbar">
        <label className="search">
          <Search size={18} />
          <input
            aria-label="Buscar insumo"
            placeholder="Buscar insumo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <AddButton onClick={() => setEdit("new")}>Novo insumo</AddButton>
      </div>
      <div className="notice">
        Quantidades de uso são normalizadas em <strong>g, ml ou un</strong>. O
        rendimento representa a parte aproveitável da compra. Alterar o preço
        recalcula todas as fichas, inclusive em meses anteriores.
      </div>
      {all.length ? (
        <Panel
          title="Sua base de ingredientes"
          subtitle={`${all.length} insumo(s) neste restaurante`}
        >
          <div className="ingredient-list">
            {rows.map((i) => (
              <div key={i.id} className="ingredient-row">
                <span className="ingredient-icon">
                  <FlaskConical size={20} />
                </span>
                <div className="ingredient-name">
                  <strong>{i.nome}</strong>
                  <small>
                    {i.quantidade} {i.unidade} por compra · {i.rendimento}% de
                    rendimento
                  </small>
                </div>
                <div className="ingredient-price">
                  <strong>{dinheiro(i.preco)}</strong>
                  <small>por embalagem de compra</small>
                </div>
                <div className="ingredient-unit">
                  <strong>
                    {(custoUnidadeUso(i).toNumber() / 100).toLocaleString(
                      "pt-BR",
                      { minimumFractionDigits: 2, maximumFractionDigits: 6 },
                    )}{" "}
                    R$/{unidadeUso(i)}
                  </strong>
                  <small>custo da unidade de uso</small>
                </div>
                <button
                  className="icon-button"
                  aria-label={`Editar insumo ${i.nome}`}
                  onClick={() => setEdit(i)}
                >
                  <Pencil size={18} />
                </button>
              </div>
            ))}
            {!rows.length && (
              <p className="muted">Nenhum insumo encontrado para esta busca.</p>
            )}
          </div>
        </Panel>
      ) : (
        <Empty
          title="O preço começa nos ingredientes"
          description="Cadastre a embalagem de compra, o preço pago e o rendimento para calcular o custo de uso."
          action={
            <AddButton onClick={() => setEdit("new")}>
              Cadastrar primeiro insumo
            </AddButton>
          }
        />
      )}
      {restaurante.id === "bora" && all.length === 0 && (
        <div className="sample-bar">
          <p>Insumos de exemplo disponíveis para Bora Burguer’s.</p>
          <button className="text-button" onClick={() => setSample(true)}>
            Carregar histórico abr/2025 <ArrowRight size={16} />
          </button>
        </div>
      )}
      {sample && (
        <Modal title="Insumos de exemplo" close={() => setSample(false)}>
          <p className="modal-copy">
            Histórico abr/2025, não atual. Pão R$ 2/un; blend R$ 50/kg (R$ 7,50
            por 150 g); mussarela R$ 33/kg; embalagem R$ 2/un. O rendimento
            demonstrativo é 100%.
          </p>
          <button className="button primary" onClick={seedBora}>
            Carregar exemplos históricos
          </button>
        </Modal>
      )}
      {edit && (
        <Modal
          title={record ? "Editar insumo" : "Novo insumo"}
          close={() => setEdit(null)}
        >
          <form onSubmit={save}>
            <Field label="Nome do insumo">
              <input
                name="nome"
                required
                maxLength={100}
                autoFocus
                defaultValue={record?.nome}
                placeholder="Ex.: mussarela"
              />
            </Field>
            <div className="form-grid">
              <Field label="Unidade de compra">
                <select name="unidade" defaultValue={record?.unidade ?? "kg"}>
                  {["kg", "g", "L", "ml", "un"].map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </Field>
              <Field label="Quantidade na embalagem">
                <input
                  name="quantidade"
                  type="number"
                  min="0.000001"
                  step="any"
                  required
                  defaultValue={record?.quantidade ?? 1}
                />
              </Field>
              <Field label="Preço pago (R$)">
                <Money name="preco" value={record?.preco} />
              </Field>
              <Field
                label="Rendimento aproveitável (%)"
                hint="Ex.: 80% significa perda de 20% da compra."
              >
                <input
                  name="rendimento"
                  type="number"
                  min="0.000001"
                  max="100"
                  step="any"
                  required
                  defaultValue={record?.rendimento ?? 100}
                />
              </Field>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="button"
                onClick={() => setEdit(null)}
              >
                Cancelar
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
  const { db, restaurante, ir, atualizar } = useSistema(),
    [edit, setEdit] = useState<Produto | "new" | null>(null),
    [search, setSearch] = useState("");
  const insumos = db.insumos.filter((i) => i.restaurante_id === restaurante.id),
    produtos = db.produtos.filter((p) => p.restaurante_id === restaurante.id),
    rows = produtos.filter((p) =>
      p.nome
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")),
    );
  return (
    <>
      <div className="section-toolbar">
        <label className="search">
          <Search size={18} />
          <input
            aria-label="Buscar ficha técnica"
            placeholder="Buscar produto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <AddButton onClick={() => setEdit("new")}>Nova ficha técnica</AddButton>
      </div>
      <div className="notice">
        CMV por porção = custo dos ingredientes com perdas ÷ rendimento. A
        embalagem base fica separada e é aplicada uma única vez na precificação.
      </div>
      {!insumos.length ? (
        <Empty
          title="Primeiro, cadastre os insumos"
          description="As fichas utilizam os custos atuais dos ingredientes do restaurante selecionado."
          action={
            <button className="button primary" onClick={() => ir("insumos")}>
              Ir para insumos <ArrowRight size={17} />
            </button>
          }
        />
      ) : !produtos.length ? (
        <Empty
          title="Dê uma ficha a cada receita"
          description="Selecione os ingredientes, informe as quantidades e descubra o CMV por porção."
          action={
            <AddButton onClick={() => setEdit("new")}>
              Criar primeira ficha
            </AddButton>
          }
        />
      ) : (
        <div className="recipe-grid">
          {rows.map((p) => (
            <Panel
              key={p.id}
              title={p.nome}
              subtitle={`${p.rendimento} porção(ões) por receita`}
              action={
                <button
                  className="icon-button"
                  aria-label={`Editar ficha ${p.nome}`}
                  onClick={() => setEdit(p)}
                >
                  <Pencil size={18} />
                </button>
              }
            >
              <div className="recipe-ingredients">
                {p.itens.map((item, idx) => {
                  const i = insumos.find((s) => s.id === item.insumo_id)!;
                  return (
                    <div key={idx}>
                      <span>{i.nome}</span>
                      <strong>
                        {item.quantidade.toLocaleString("pt-BR")}{" "}
                        {unidadeUso(i)}
                        {item.perda > 0 && (
                          <small> + {item.perda}% perda</small>
                        )}
                      </strong>
                    </div>
                  );
                })}
              </div>
              <div className="recipe-cost">
                <div>
                  <small>CMV de ingredientes / porção</small>
                  <strong>{dinheiro(calcularCMV(p, insumos))}</strong>
                </div>
                <div>
                  <small>Embalagem base / porção</small>
                  <strong>{dinheiro(p.embalagem)}</strong>
                </div>
              </div>
            </Panel>
          ))}
          {!rows.length && <p>Nenhuma ficha encontrada.</p>}
        </div>
      )}
      {edit && !!insumos.length && (
        <FichaModal
          produto={edit === "new" ? null : edit}
          insumos={insumos}
          close={() => setEdit(null)}
          save={(p) => {
            if (
              atualizar((draft) => {
                const i = draft.produtos.findIndex((x) => x.id === p.id);
                if (i < 0) draft.produtos.push(p);
                else draft.produtos[i] = p;
              }, "Ficha salva. A precificação foi recalculada.")
            )
              setEdit(null);
          }}
        />
      )}
    </>
  );
}
function FichaModal({
  produto,
  insumos,
  close,
  save,
}: {
  produto: Produto | null;
  insumos: Insumo[];
  close: () => void;
  save: (p: Produto) => void;
}) {
  const { restaurante } = useSistema(),
    [itens, setItens] = useState<ItemFicha[]>(
      structuredClone(
        produto?.itens ?? [
          { insumo_id: insumos[0].id, quantidade: 1, perda: 0 },
        ],
      ),
    ),
    [rendimento, setRendimento] = useState(produto?.rendimento ?? 1);
  let cmv: number | null = null;
  try {
    cmv = calcularCMV(
      {
        id: "",
        restaurante_id: restaurante.id,
        nome: "",
        rendimento,
        itens,
        embalagem: 0,
      },
      insumos,
    );
  } catch {
    /* A edição pode estar incompleta. */
  }
  function saveForm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    save({
      id: produto?.id ?? crypto.randomUUID(),
      restaurante_id: restaurante.id,
      nome: formString(f, "nome"),
      rendimento,
      itens,
      embalagem: paraCentavos(formString(f, "embalagem")),
    });
  }
  function change(idx: number, patch: Partial<ItemFicha>) {
    setItens((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    );
  }
  return (
    <Modal
      title={produto ? "Editar ficha técnica" : "Nova ficha técnica"}
      close={close}
    >
      <form onSubmit={saveForm}>
        <Field label="Nome do produto">
          <input
            required
            name="nome"
            maxLength={100}
            defaultValue={produto?.nome}
            autoFocus
            placeholder="Ex.: Hambúrguer da casa"
          />
        </Field>
        <div className="form-grid">
          <Field label="Rendimento (porções)">
            <input
              name="rendimento"
              type="number"
              min="0.000001"
              step="any"
              required
              value={rendimento}
              onChange={(e) => setRendimento(Number(e.target.value))}
            />
          </Field>
          <Field label="Embalagem base por porção (R$)">
            <Money name="embalagem" value={produto?.embalagem} />
          </Field>
        </div>
        <h3 className="form-subtitle">Ingredientes da receita</h3>
        {itens.map((item, idx) => {
          const insumo = insumos.find((i) => i.id === item.insumo_id)!;
          return (
            <div className="recipe-item" key={idx}>
              <Field label="Insumo">
                <select
                  value={item.insumo_id}
                  onChange={(e) => change(idx, { insumo_id: e.target.value })}
                >
                  {insumos.map((i) => (
                    <option value={i.id} key={i.id}>
                      {i.nome} ({unidadeUso(i)})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`Quantidade (${unidadeUso(insumo)})`}>
                <input
                  type="number"
                  min="0.000001"
                  step="any"
                  required
                  value={item.quantidade}
                  onChange={(e) =>
                    change(idx, { quantidade: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="Perda adicional (%)">
                <input
                  type="number"
                  min="0"
                  max="99.999999"
                  step="any"
                  required
                  value={item.perda}
                  onChange={(e) =>
                    change(idx, { perda: Number(e.target.value) })
                  }
                />
              </Field>
              <button
                type="button"
                className="icon-button danger"
                aria-label={`Remover ingrediente ${insumo.nome}`}
                onClick={() =>
                  setItens((rows) => rows.filter((_, i) => i !== idx))
                }
              >
                <Trash2 size={18} />
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
              { insumo_id: insumos[0].id, quantidade: 1, perda: 0 },
            ])
          }
        >
          <Plus size={17} />
          Adicionar ingrediente
        </button>
        <p className="field-help">
          A perda adicional é exclusiva do preparo e se soma ao efeito do
          rendimento de compra. Não informe a mesma perda duas vezes.
        </p>
        <div className="cmv-preview">
          <NotebookPen size={21} />
          <span>CMV por porção</span>
          <strong>
            {cmv === null ? "Complete os ingredientes" : dinheiro(cmv)}
          </strong>
        </div>
        <div className="form-actions">
          <button type="button" className="button" onClick={close}>
            Cancelar
          </button>
          <button className="button primary" disabled={cmv === null}>
            Salvar ficha técnica
          </button>
        </div>
      </form>
    </Modal>
  );
}
