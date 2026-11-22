"use client";
import { embalagensBoraPendentes, insumoArquivado } from "@/lib/insumos";
import { confirmarExclusao } from "./ui";
import { useMemo, useState } from "react";
import Image from "next/image";
import {
  TriangleAlert,
  BookOpen,
  ChevronDown,
  CircleCheck,
  ClipboardList,
  Clock3,
  CookingPot,
  Search,
} from "lucide-react";
import {
  alertasDeInsumos,
  compararPrecosInsumo,
  type AltaManualInsumo,
  type AlertaInsumo,
} from "@/lib/alertas-insumos";
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
  custoUnidadeUso,
  dinheiro,
  insumoDeEmbalagem,
  paraCentavos,
  percentual,
  preservarUnidadesDeFicha,
  unidadeUso,
  unidadesFicha,
} from "@/lib/dna";
import { insumosMes } from "@/lib/v2";
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
import { preparoPendente } from "./readiness";
import { Numeric } from "./numeric";

const moedaInsumo = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 4,
});

function AlertasInsumos({ alertas }: { alertas: AlertaInsumo[] }) {
  if (!alertas.length) return null;
  return (
    <Panel
      title="Altas de preço dos insumos"
      subtitle="Compare o preço de compra por quilo, litro ou unidade e consulte os pratos afetados."
    >
      <div className="alertas-insumos">
        {alertas.map(({ insumoId, nome, alta, pratos }) => (
          <details className="notice warning alerta-insumo" key={insumoId}>
            <summary>
              <TriangleAlert aria-hidden="true" size={16} />{" "}
              <strong>{nome}</strong>{alta.variacao === null ? " · Alta de preço" : ` · +${percentual(alta.variacao)}`}
              {` · ${pratos.length === 1 ? "1 prato afetado" : `${pratos.length} pratos afetados`}`}
            </summary>
            <p>
              {moedaInsumo.format(alta.anterior.valor / 100)} / {alta.anterior.unidade}
              {` (${alta.referenciaAnterior}) → `}
              <strong>{moedaInsumo.format(alta.atual.valor / 100)} / {alta.atual.unidade}</strong>
            </p>
            {pratos.length ? (
              <ul>
                {pratos.map(({ produto, direto, viaReceitas }) => (
                  <li key={produto.id}>
                    <strong>{produto.nome}</strong>
                    {direto ? " · Uso direto" : ""}
                    {viaReceitas.length ? ` · Via ${viaReceitas.join(", ")}` : ""}
                  </li>
                ))}
              </ul>
            ) : <p>Nenhuma ficha técnica cadastrada usa este insumo.</p>}
          </details>
        ))}
      </div>
    </Panel>
  );
}

export function Insumos() {
  const { db, restaurante, mes, atualizar, avisar, filtro } = useSistema();
  const [edit, setEdit] = useState<Insumo | "new" | null>(null),
    [busca, setBusca] = useState(""),
    [status, setStatus] = useState(filtro),
    [cadastrarEmbalagens, setCadastrarEmbalagens] = useState(false),
    [altaManual, setAltaManual] = useState<AltaManualInsumo | null>(null),
    [error, setError] = useState("");
  const rows = insumosMes(db, mes).filter(
      (i) => i.restaurante_id === restaurante.id,
    ),
    record = edit && edit !== "new" ? edit : null;
  const embalagensPendentes = restaurante.id === "bora" ? embalagensBoraPendentes(db.insumos) : [];
  const emCombo = db.combos?.some((combo) => combo.embalagens?.some((item) => item.insumo_id === record?.id));
  const setor = restaurante.id;
  const alertas = useMemo(() => alertasDeInsumos(db, setor, mes, altaManual), [db, setor, mes, altaManual]);
  function gravarEmbalagens() {
    if (atualizar((draft) => {
      for (const modelo of embalagensBoraPendentes(draft.insumos)) {
        const compra = { unidade: "un" as const, quantidade: modelo.quantidade, preco: modelo.preco, rendimento: 100 };
        draft.insumos.push({
          ...modelo, ...compra, restaurante_id: restaurante.id, categoria: "embalagem",
          historicoPrecos: { [mes]: compra },
        });
      }
    }, "Embalagens cadastradas nos insumos do Bora.")) {
      setCadastrarEmbalagens(false);
      setStatus("todos");
      setBusca("");
    }
  }
  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      if (!formString(f, "nome"))
        throw new Error("Nome: informe o nome do insumo.");
      const unidadesTexto = formString(f, "unidadesNaCompra");
      const unidade = formString(f, "unidade") as Unidade;
      const unidadesNaCompra =
        unidadesTexto && unidade !== "un"
          ? formNumber(f, "unidadesNaCompra")
          : undefined;
      if (
        unidadesNaCompra !== undefined &&
        (!Number.isSafeInteger(unidadesNaCompra) || unidadesNaCompra <= 0)
      ) {
        throw new Error("Informe uma quantidade inteira e positiva de unidades no pacote.");
      }
      const snapshot = {
        preco: paraCentavos(formString(f, "preco")),
        quantidade: formNumber(f, "quantidade"),
        unidade,
        unidadesNaCompra,
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
      const anterior = record?.historicoPrecos?.[mes];
      const alta = record && compararPrecosInsumo(snapshot, anterior ?? record, "preço antes da última edição");
      const mensagem = alta
        ? `Preço de compra de ${formString(f, "nome")} subiu. Consulte os pratos afetados em Insumos.`
        : "Insumo salvo nesta competência. Meses anteriores preservados.";
      if (
        atualizar((d) => {
          const original = d.insumos.find((i) => i.id === record?.id);
          if (original) preservarUnidadesDeFicha(d, record ?? original, unidade);
          const historicoAnterior = original?.historicoPrecos ??
            (original
              ? {
                  "0000-01": {
                    preco: original.preco,
                    quantidade: original.quantidade,
                    unidade: original.unidade,
                    rendimento: original.rendimento,
                    precoPendente: Boolean(original.precoPendente),
                    unidadesNaCompra: original.unidadesNaCompra,
                  },
                }
              : {});
          const historicoPrecos = { ...historicoAnterior, [mes]: snapshot };
          const ultimaCompetencia = Object.keys(historicoPrecos).sort().at(-1)!;
          const ultimo = historicoPrecos[ultimaCompetencia];
          const i: Insumo = {
            ...original,
            ...ultimo,
            unidadesNaCompra: ultimo.unidadesNaCompra,
            id: record?.id ?? crypto.randomUUID(),
            restaurante_id: restaurante.id,
            nome: formString(f, "nome"),
            categoria: formString(f, "categoria") || undefined,
            historicoPrecos,
          };
          if (original) d.insumos[d.insumos.indexOf(original)] = i;
          else d.insumos.push(i);
        }, mensagem)
      ) {
        if (record && anterior) {
          setAltaManual(alta ? { insumoId: record.id, mes, alta } : null);
        }
        setEdit(null);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="filter-chips">
        {["todos", "pendentes", "arquivados"].map((f) => (
          <button
            key={f}
            className="button"
            aria-pressed={status === f}
            onClick={() => setStatus(f)}
          >
            {f === "pendentes" ? "Pendentes" : f === "arquivados" ? "Arquivados" : "Ativos"}
          </button>
        ))}
      </div>
      <div className="section-toolbar">
        <input
          aria-label="Buscar insumo"
          placeholder="Buscar insumo…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {embalagensPendentes.length > 0 && (
          <button type="button" className="button" onClick={() => setCadastrarEmbalagens(true)}>Cadastrar embalagens do Bora</button>
        )}
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
      <AlertasInsumos alertas={alertas} />
      <Panel
        title={`Insumos de ${restaurante.nome}`}
        subtitle={`${rows.filter((i) => i.precoPendente && !insumoArquivado(i)).length} preços pendentes`}
      >
        {rows
          .filter(
            (i) =>
              i.nome.toLocaleLowerCase().includes(busca.toLocaleLowerCase()) &&
              (status === "arquivados" ? insumoArquivado(i) : !insumoArquivado(i)) &&
              (status !== "pendentes" || i.precoPendente),
          )
          .map((i) => (
            <div
              className="ingredient-row clickable-row"
              role="button"
              tabIndex={0}
              aria-label={`Editar ${i.nome}`}
              onClick={() => {
                setError("");
                setEdit(i);
              }}
              onKeyDown={(e) => {
                if (
                  e.target === e.currentTarget &&
                  (e.key === "Enter" || e.key === " ")
                ) {
                  e.preventDefault();
                  setEdit(i);
                }
              }}
              key={i.id}
            >
              <div className="ingredient-name">
                <strong>{i.nome}</strong>
                <small>
                  {i.quantidade.toLocaleString("pt-BR")} {i.unidade} ·{" "}
                  {i.rendimento.toLocaleString("pt-BR")}% aproveitável
                  {i.unidadesNaCompra !== undefined &&
                    ` · ${i.unidadesNaCompra.toLocaleString("pt-BR")} un na compra`}
                  {insumoDeEmbalagem(i) && !i.precoPendente && unidadesFicha(i).includes("un") &&
                    ` · ${dinheiro(custoUnidadeUso(i, "un"))}/un`}
                  {(() => {
                    const compra = [...(db.compras ?? [])]
                      .filter(
                        (c) =>
                          c.restaurante_id === restaurante.id &&
                          c.itens.some(
                            (l) => l.insumo_id === i.id && !l.ignorar,
                          ),
                      )
                      .sort((a, b) => b.data.localeCompare(a.data))[0];
                    const line = compra?.itens.find(
                      (l) => l.insumo_id === i.id && !l.ignorar,
                    );
                    return (
                      line && (
                        <span className="last-purchase">
                          Último preço:{" "}
                          {dinheiro(
                            Math.round(
                              (line.valorUnitario / (line.conteudo ?? 1)) * 100,
                            ),
                          )}
                          /{line.unidade} · Compra:{" "}
                          {compra.data.split("-").reverse().join("/")}
                        </span>
                      )
                    );
                  })()}
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
      {cadastrarEmbalagens && embalagensPendentes.length > 0 && (
        <Modal title="Cadastrar embalagens do Bora" close={() => setCadastrarEmbalagens(false)}>
          <Panel title={`Preços de compra · ${mes.split("-").reverse().join("/")}`}>
            {embalagensPendentes.map((item) => (
              <p key={item.id}>{item.nome} · {item.quantidade} un · {dinheiro(item.preco)} por pacote</p>
            ))}
          </Panel>
          <div className="form-actions">
            <button type="button" className="button" onClick={() => setCadastrarEmbalagens(false)}>Cancelar</button>
            <button type="button" className="button primary" onClick={gravarEmbalagens}>Salvar embalagens</button>
          </div>
        </Modal>
      )}
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
              <Field label="Categoria">
                <select name="categoria" defaultValue={record && insumoDeEmbalagem(record) ? "embalagem" : record?.categoria ?? ""}>
                  <option value="">Insumo geral</option>
                  <option value="embalagem">Embalagem</option>
                  {record?.categoria && record.categoria !== "embalagem" && (
                    <option value={record.categoria}>{record.categoria}</option>
                  )}
                </select>
              </Field>
              <Field label="Unidade de compra">
                <select name="unidade" defaultValue={record?.unidade ?? "kg"}>
                  {["kg", "g", "L", "ml", "un"].map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </Field>
              <Field label="Quantidade da compra" hint="Para um pacote com 50 peças, escolha un e informe 50.">
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
              <Field
                label="Unidades ou fatias na compra"
                hint="Informe o total de unidades ou fatias correspondente ao preço pago. Se já compra em un, preencha apenas Quantidade da compra."
              >
                <Numeric
                  name="unidadesNaCompra"
                  min={1}
                  step={1}
                  defaultValue={record?.unidadesNaCompra ?? ""}
                  placeholder="Ex.: 40 fatias"
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
                      {h.unidadesNaCompra !== undefined &&
                        ` · ${h.unidadesNaCompra.toLocaleString("pt-BR")} un na compra`}
                    </p>
                  ))}
              </Panel>
            )}
            <div className="form-actions">
              {record && (
                <button type="button" className="button" onClick={() => {
                  const arquivado = !insumoArquivado(record);
                  if (arquivado && (emCombo || [...db.produtos, ...(db.receitas ?? [])].some(
                    (p) => p.itens.some((i) => i.insumo_id === record.id),
                  ))) {
                    avisar("Insumo em uso. Revise as fichas e os combos antes de arquivar.");
                    return;
                  }
                  if (atualizar((d) => {
                    const insumo = d.insumos.find((i) => i.id === record.id);
                    if (insumo) insumo.arquivado = arquivado;
                  }, arquivado ? "Insumo arquivado nesta operação." : "Insumo reativado.")) setEdit(null);
                }}>
                  {insumoArquivado(record) ? "Reativar insumo" : "Arquivar insumo"}
                </button>
              )}
              <button
                type="button"
                className="button danger"
                onClick={async () => {
                  if (!record || !(await confirmarExclusao(record.nome)))
                    return;
                  if (
                    emCombo || db.produtos.some((p) =>
                      p.itens.some((x) => x.insumo_id === record.id),
                    ) ||
                    db.receitas?.some((p) =>
                      p.itens.some((x) => x.insumo_id === record.id),
                    )
                  ) {
                    avisar("Insumo em uso. Remova das fichas e dos combos primeiro.");
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
const fotosFicha: Readonly<Record<string, string>> = {
  "seed-p0": "x-salada-real-fundo-branco",
  "seed-p1": "x-burguer-fundo-branco",
  "seed-p3": "chicken-fundo-branco",
  "seed-p41": "sashimi-salmao-fundo-branco",
  "seed-p56": "hot-ball-fundo-branco",
  "seed-p58": "oniguiri-salmao-fundo-branco",
};
const filtrosPreparo = [
  { id: "todos", rotulo: "Todos" },
  { id: "pendentes", rotulo: "Pendentes" },
  { id: "prontos", rotulo: "Prontos" },
] as const;

function Preparos({ casa }: { casa: boolean }) {
  const { db, restaurante, mes, atualizar, filtro } = useSistema();
  const [status, setStatus] = useState(filtro);
  const [edit, setEdit] = useState<Produto | ReceitaCasa | "new" | null>(null),
    [busca, setBusca] = useState("");
  async function excluirPreparo(preparo: Produto | ReceitaCasa) {
    const referencias = (dados: typeof db) => [...(dados.receitas ?? []), ...dados.produtos]
      .filter((r) => r.restaurante_id === restaurante.id &&
        r.itens.some((item) => item.receita_id === preparo.id));
    const usos = casa ? referencias(db) : [];
    const mensagem = usos.length
      ? `A receita será removida de ${usos.map((r) => r.nome).join(", ")}. Esses preparos ficarão pendentes para revisão de custos.`
      : undefined;
    if (!(await confirmarExclusao(preparo.nome, mensagem))) return;
    if (atualizar((dados) => {
      if (casa) {
        const dependentes = referencias(dados);
        if (dependentes.some((r) => !usos.some((original) => original.id === r.id))) {
          throw new Error("Os vínculos mudaram. Abra a exclusão novamente para conferir.");
        }
        for (const dependente of dependentes) {
          dependente.itens = dependente.itens.filter((i) => i.receita_id !== preparo.id);
          dependente.pendente = true;
        }
        dados.receitas = dados.receitas?.filter((r) => r.id !== preparo.id);
      } else {
        if (dados.combos?.some((combo) => combo.itens.some((item) => item.produto_id === preparo.id))) {
          throw new Error("Esta ficha está em um combo. Remova o produto do combo primeiro.");
        }
        dados.produtos = dados.produtos.filter((r) => r.id !== preparo.id);
        dados.precos = dados.precos.filter((p) => p.produto_id !== preparo.id);
      }
    }, casa ? "Receita excluída." : "Ficha excluída.")) {
      setEdit(null);
    }
  }
  const insumos = insumosMes(db, mes);
  const itens = (casa ? (db.receitas ?? []) : db.produtos)
    .filter((preparo) => preparo.restaurante_id === restaurante.id)
    .map((preparo) => ({
      preparo,
      pendente: preparoPendente(db, mes, preparo, casa),
    }));
  const pendentes = itens.filter(({ pendente }) => pendente).length;
  const contagem = { todos: itens.length, pendentes, prontos: itens.length - pendentes };
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const resultados = itens.filter(
    ({ preparo, pendente }) =>
      preparo.nome.toLocaleLowerCase("pt-BR").includes(termo) &&
      (status === "todos" || pendente === (status === "pendentes")),
  );
  return (
    <div className="preparos-workspace">
      <div className="preparos-controls">
        <div className="preparos-toolbar">
          <label className="preparos-search">
            <Search size={18} aria-hidden="true" />
            <input
              aria-label={casa ? "Buscar receita da casa" : "Buscar ficha técnica"}
              placeholder={casa ? "Buscar receita da casa" : "Buscar ficha técnica"}
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </label>
          <AddButton onClick={() => setEdit("new")}>
            {casa ? "Nova receita da casa" : "Nova ficha técnica"}
          </AddButton>
        </div>
        <div className="preparos-filters" role="group" aria-label="Situação da composição">
          {filtrosPreparo.map(({ id, rotulo }) => (
            <button
              key={id}
              type="button"
              aria-pressed={status === id}
              onClick={() => setStatus(id)}
            >
              {rotulo} <span>{contagem[id]}</span>
            </button>
          ))}
        </div>
      </div>

      <details className="preparos-guide">
        <summary><BookOpen size={16} aria-hidden="true" /> {casa ? "Como cadastrar uma receita" : "Como preencher uma ficha"} <ChevronDown size={16} aria-hidden="true" /></summary>
        <p>
          {casa
            ? "Informe o rendimento em g, ml ou un. Confirme a composição e cadastre os produtos comprados prontos em Insumos."
            : "Use g, ml ou un. Registre os ingredientes da base em “Todos os canais” e as cortesias em “Salão”. Informe a embalagem nos ingredientes ou no campo de valor separado."}
        </p>
      </details>

      {resultados.length ? (
        <div className="preparos-grid">
          {resultados.map(({ preparo, pendente }) => {
            let custo: string | undefined;
            try {
              custo = dinheiro(
                casa
                  ? custoReceita(preparo as ReceitaCasa, insumos, db.receitas ?? [])
                  : calcularCMV(
                      {
                        ...preparo,
                        itens: preparo.itens.filter((item) => !item.canal),
                      } as Produto,
                      insumos,
                      db.receitas,
                    ),
              );
            } catch {
              // O status do preparo indica a composição que ainda precisa de revisão.
            }
            const preco = "precoCardapio" in preparo ? preparo.precoCardapio : undefined;
            const foto = casa ? undefined : fotosFicha[preparo.id];
            const IconeStatus = pendente ? Clock3 : CircleCheck;
            return (
              <article className="preparo-card" key={preparo.id}>
                <div className="preparo-card-heading">
                  <div className="preparo-thumbnail">
                    {foto ? (
                      <Image
                        src={`/fichas/${foto}.webp`}
                        alt=""
                        width={64}
                        height={64}
                        unoptimized
                      />
                    ) : casa ? (
                      <CookingPot size={24} aria-hidden="true" />
                    ) : (
                      <ClipboardList size={24} aria-hidden="true" />
                    )}
                  </div>
                  <div>
                    <h2>{preparo.nome}</h2>
                    <span className={`preparo-status ${pendente ? "is-pending" : "is-ready"}`}>
                      <IconeStatus size={14} aria-hidden="true" />
                      {pendente ? "Pendente" : "Composição confirmada"}
                    </span>
                  </div>
                </div>
                <dl className="preparo-metrics">
                  <div>
                    <dt>{casa ? "Custo por unidade de uso" : "Custo base"}</dt>
                    <dd className={custo === undefined ? "preparo-sem-custo" : undefined}>
                      {custo ?? "A confirmar"}
                    </dd>
                  </div>
                  {preco !== undefined && (
                    <div>
                      <dt>Preço no salão</dt>
                      <dd>{dinheiro(preco)}</dd>
                    </div>
                  )}
                </dl>
                {preparo.notas && (
                  <details className="preparo-note">
                    <summary>Ver nota <ChevronDown size={15} aria-hidden="true" /></summary>
                    <p>{preparo.notas}</p>
                  </details>
                )}
                <div className="preparo-card-footer">
                  <span>{preparo.itens.length} {preparo.itens.length === 1 ? "item" : "itens"}</span>
                  {casa && (
                    <button type="button" className="button danger" aria-label={`Excluir receita de ${preparo.nome}`} onClick={() => void excluirPreparo(preparo)}>
                      Excluir
                    </button>
                  )}
                  <button
                    type="button"
                    className={`button ${pendente ? "preparo-completar" : ""}`}
                    aria-label={`${pendente ? "Completar" : "Editar"} ${casa ? "receita" : "ficha"} de ${preparo.nome}`}
                    onClick={() => setEdit(preparo)}
                  >
                    {pendente ? (casa ? "Completar receita" : "Completar ficha") : "Editar"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          title="Nenhum resultado"
          description={busca || status !== "todos" ? "Tente outro nome ou mude o filtro." : casa ? "As receitas da casa aparecem aqui depois de cadastradas." : "As fichas técnicas aparecem aqui depois de cadastradas."}
          action={busca || status !== "todos" ? (
            <button type="button" className="button" onClick={() => { setBusca(""); setStatus("todos"); }}>Limpar filtros</button>
          ) : undefined}
        />
      )}
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
                  const receita = p as ReceitaCasa;
                  if (idx < 0) d.receitas.push(receita);
                  else {
                    preservarUnidadesDeFicha(d, d.receitas[idx], receita.unidade, true);
                    d.receitas[idx] = receita;
                  }
                } else {
                  const idx = d.produtos.findIndex((r) => r.id === p.id);
                  if (idx < 0) d.produtos.push(p as Produto);
                  else d.produtos[idx] = p as Produto;
                }
              }, "Ficha salva. Custos propagados.")
            )
              setEdit(null);
          }}
          remove={() => { if (edit !== "new") void excluirPreparo(edit); }}
        />
      )}
    </div>
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
    ...insumos.filter((i) => !insumoArquivado(i)).map((i) => ({
      id: i.id,
      nome: i.nome,
      unidade: unidadeUso(i),
      unidades: unidadesFicha(i),
      receita: false,
    })),
    ...receitas.map((r) => ({
      id: r.id,
      nome: r.nome,
      unidade: unidadeUso(r),
      unidades: unidadesFicha(r),
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
      const itensConfirmados = itens.map((item) => {
        const opcao = options.find(
          ({ id }) => id === (item.receita_id || item.insumo_id),
        );
        const unidade = item.unidade ?? opcao?.unidade;
        if (!opcao || !unidade || !opcao.unidades.includes(unidade)) {
          throw new Error(
            "Confira a unidade de cada item e o conteúdo do pacote no cadastro do insumo.",
          );
        }
        return { ...item, unidade, confirmar: false };
      });
      const p = {
        ...record,
        id: record?.id ?? crypto.randomUUID(),
        restaurante_id: restaurante.id,
        nome: formString(f, "nome"),
        rendimento: formNumber(f, "rendimento"),
        itens: itensConfirmados,
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
        <p className="field-help">
          Para usar fatias ou peças de um insumo vendido por peso, informe as unidades da compra em Insumos.
        </p>
        {itens.map((item, idx) => {
          const selected = item.receita_id || item.insumo_id;
          const o = options.find((o) => o.id === selected);
          const unidade = item.unidade ?? o?.unidade;
          const unidadesDisponiveis = o?.unidades ?? [];
          const unidadeIndisponivel =
            unidade !== undefined && !unidadesDisponiveis.includes(unidade);
          return (
            <div
              className={`recipe-item recipe-item-com-medida ${casa ? "recipe-item-casa" : ""}`}
              key={idx}
            >
              <Field label="Insumo ou receita">
                <select
                  required
                  value={selected}
                  onChange={(e) => {
                    const novaOpcao = options.find((o) => o.id === e.target.value);
                    change(idx, {
                      insumo_id: novaOpcao && !novaOpcao.receita ? novaOpcao.id : "",
                      receita_id: novaOpcao?.receita ? novaOpcao.id : undefined,
                      unidade: novaOpcao?.unidade,
                      quantidade: 0,
                      confirmar: true,
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
              <Field label="Unidade na ficha">
                <select
                  aria-label={o ? `Unidade de ${o.nome}` : "Unidade na ficha"}
                  value={unidade ?? ""}
                  disabled={!o}
                  onChange={(e) =>
                    change(idx, {
                      unidade: e.target.value as Unidade,
                      quantidade: 0,
                      confirmar: true,
                    })
                  }
                >
                  {!unidade && <option value="">Selecione o insumo</option>}
                  {unidadeIndisponivel && (
                    <option value={unidade} disabled>
                      {unidade} · confira o insumo
                    </option>
                  )}
                  {unidadesDisponiveis.map((medida) => (
                    <option key={medida} value={medida}>
                      {medida}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={`Quantidade (${unidade ?? "unidade"})${item.confirmar ? " · confirmar" : ""}`}
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
                onClick={async () => {
                  if (await confirmarExclusao(o?.nome ?? "Item da ficha"))
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
