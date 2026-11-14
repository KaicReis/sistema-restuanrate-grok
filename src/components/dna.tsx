"use client";
import { insumosMes } from "@/lib/v2";
import { Numeric } from "./numeric";
import { useState, useRef, useEffect } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CircleDollarSign,
  Copy,
  Plus,
  Target,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  calcularPrecoDNA,
  dinheiro,
  fixosOperacionais,
  percentual,
  paraCentavos,
  taxaCanal,
} from "@/lib/dna";
import { historicoVila, novosCanais } from "@/lib/storage/seed";
import type { CustoFixo } from "@/lib/types";
import { useSistema } from "./context";
import { Field, Money, Panel, Modal, formNumber, formString } from "./ui";
export function Overview() {
  const { db, dna, restaurante, ir } = useSistema(),
    [canalId, setCanal] = useState("");
  const canais = db.canais.filter(
      (c) =>
        c.restaurante_id === restaurante.id &&
        c.competencia === dna.competencia,
    ),
    canal = canais.find((c) => c.id === canalId) ?? canais[0],
    fixos = fixosOperacionais(dna);
  const result = calcularPrecoDNA({
    faturamentoReferencia: dna.faturamento,
    custosFixosOperacionais: fixos,
    variaveis: canal ? taxaCanal(canal) : 0,
    impostos: dna.imposto / 100,
    margem: dna.margem / 100,
    cmvIngredientes: 0,
  });
  const produtos = db.produtos.filter(
      (p) => p.restaurante_id === restaurante.id,
    ),
    insumos = insumosMes(db, dna.competencia).filter(
      (i) => i.restaurante_id === restaurante.id,
    );
  const parts = [
    {
      name: "Fixos operacionais",
      value: dna.faturamento ? fixos / dna.faturamento : 0,
      color: "#234f42",
    },
    {
      name: "Custos variáveis",
      value: canal ? taxaCanal(canal) : 0,
      color: "#8ea69a",
    },
    { name: "Impostos", value: dna.imposto / 100, color: "#c7c6b8" },
    { name: "Meta de lucro", value: dna.margem / 100, color: "#d7ad66" },
    {
      name: "CMV disponível",
      value: result.viavel ? result.cmvMaximoPercentual : 0,
      color: "#a9c9a9",
    },
  ];
  let angle = 0;
  const gradient = parts
    .map((p) => {
      const start = angle;
      angle += p.value * 100;
      return `${p.color} ${start}% ${angle}%`;
    })
    .join(", ");
  return (
    <>
      <div className="notice warning">
        Pendências: {insumos.filter((i) => i.precoPendente).length} insumos sem
        preço · {produtos.filter((p) => p.pendente || !p.itens.length).length}{" "}
        fichas incompletas ·{" "}
        {
          (db.receitas ?? []).filter(
            (r) => r.restaurante_id === restaurante.id && r.pendente,
          ).length
        }{" "}
        receitas da casa a confirmar.
      </div>
      <div className="welcome-banner">
        <div>
          <span className="pill light">
            <span className="status-dot" /> SEU NEGÓCIO EM PERSPECTIVA
          </span>
          <h2>
            Um restaurante saudável
            <br />
            começa com um bom <em>DNA.</em>
          </h2>
          <p>
            Conheça seus custos, proteja sua margem e precifique com confiança.
          </p>
          <button className="button cream" onClick={() => ir("dna")}>
            {dna.faturamento ? "Revisar DNA do mês" : "Configurar meu DNA"}
            <ArrowUpRight size={18} />
          </button>
        </div>
        <div className="banner-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <div className="art-center">
            dna<span>.</span>
          </div>
          <span className="art-label label-one">CUSTO</span>
          <span className="art-label label-two">MARGEM</span>
          <span className="art-label label-three">EQUILÍBRIO</span>
        </div>
      </div>
      {dna.historico && (
        <div className="notice warning">
          Histórico abr/2025, não atual. Valores de referência fornecidos para
          demonstração.
        </div>
      )}
      <div className="stats-grid">
        <Stat
          label={`Faturamento de referência · ${dna.tipoFaturamento}`}
          value={dinheiro(dna.faturamento)}
          note="Base para o DNA desta competência"
          icon={<CircleDollarSign />}
        />
        <Stat
          label="Fixos operacionais"
          value={dinheiro(fixos)}
          note={
            dna.faturamento
              ? `${percentual(fixos / dna.faturamento)} do faturamento de referência`
              : "Defina o faturamento para calcular a proporção"
          }
          icon={<Wallet />}
        />
        <Stat
          label="Meta de margem líquida"
          value={percentual(dna.margem / 100)}
          note="Margem gerencial sobre a receita bruta"
          icon={<Target />}
        />
        <Stat
          label="CMV máximo permitido"
          value={result.viavel ? percentual(result.cmvMaximoPercentual) : "—"}
          note={
            canal
              ? `Disponível para custos diretos · ${canal.nome}`
              : "Cadastre um canal de venda"
          }
          icon={<TrendingUp />}
          accent
        />
      </div>
      <div className="overview-grid">
        <Panel
          title="Para onde vai cada R$ 100?"
          subtitle="A distribuição que sustenta seu preço."
          action={
            <select
              aria-label="Canal para distribuição"
              value={canal?.id ?? ""}
              onChange={(e) => setCanal(e.target.value)}
            >
              {canais.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          }
        >
          {result.viavel ? (
            <div className="distribution">
              <div
                className="donut"
                style={{ background: `conic-gradient(${gradient})` }}
              >
                <div>
                  <small>A CADA</small>
                  <strong>R$ 100</strong>
                  <span>de faturamento</span>
                </div>
              </div>
              <div className="distribution-legend">
                {parts.map((p) => (
                  <div className="legend-row" key={p.name}>
                    <span>
                      <i style={{ background: p.color }} />
                      {p.name}
                    </span>
                    <strong>{dinheiro(p.value * 10000)}</strong>
                  </div>
                ))}
                <small className="muted">
                  O CMV disponível cobre ingredientes, embalagem e custo por
                  unidade do canal.
                </small>
              </div>
            </div>
          ) : (
            <div className="dna-pending">
              <Target size={35} />
              <h3>
                {dna.faturamento
                  ? "O DNA não comporta a margem desejada"
                  : "Vamos dar forma aos seus números?"}
              </h3>
              <p>
                {dna.faturamento
                  ? "Aumente o faturamento de referência ou reduza despesas e taxas. Reduzir CMV ajuda o preço, mas não corrige um denominador nulo ou negativo."
                  : "Informe o faturamento e as despesas para visualizar como cada real é distribuído."}
              </p>
              <button className="text-button" onClick={() => ir("dna")}>
                Ajustar DNA <ArrowRight size={16} />
              </button>
            </div>
          )}
        </Panel>
        <Panel
          title="Seu caminho até o preço"
          subtitle="Uma boa decisão começa pela base."
        >
          <div className="steps">
            {[
              {
                title: "Defina o DNA do mês",
                text: "Receita, despesas e meta de margem.",
                done: dna.faturamento > 0,
                page: "dna" as const,
              },
              {
                title: "Cadastre seus insumos",
                text: "Preços de compra e rendimento.",
                done: insumos.length > 0,
                page: "insumos" as const,
              },
              {
                title: "Monte as fichas técnicas",
                text: "O custo de cada produto, por porção.",
                done: produtos.length > 0,
                page: "fichas" as const,
              },
              {
                title: "Encontre seu preço",
                text: "Compare a margem em cada canal.",
                done: db.precos.some(
                  (p) => p.restaurante_id === restaurante.id,
                ),
                page: "precos" as const,
              },
            ].map((s, i) => (
              <button key={s.title} className="step" onClick={() => ir(s.page)}>
                <span className={`step-number ${s.done ? "done" : ""}`}>
                  {s.done ? "✓" : `0${i + 1}`}
                </span>
                <span>
                  <strong>{s.title}</strong>
                  <small>{s.text}</small>
                </span>
                <ArrowUpRight size={16} />
              </button>
            ))}
          </div>
        </Panel>
      </div>
      <div className="insight">
        <span className="insight-icon">✦</span>
        <div>
          <strong>Seu preço precisa cuidar do seu negócio.</strong>
          <p>
            A meta padrão de 30% é um ponto de partida. Ajuste o DNA à realidade
            da sua operação, mês a mês.
          </p>
        </div>
        <button className="text-button" onClick={() => ir("precos")}>
          Ver precificação <ArrowRight size={17} />
        </button>
      </div>
    </>
  );
}
function Stat({
  label,
  value,
  note,
  icon,
  accent = false,
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`stat ${accent ? "stat-accent" : ""}`}>
      <div className="stat-label">
        {label}
        <span>{icon}</span>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
export function DNAEditor() {
  const { dna, atualizar, db, restaurante, mes, selecionar, avisar } =
    useSistema();
  const [fixos, setFixos] = useState(
      dna.fixos
        .filter((f) => f.id !== "rateio-aluguel")
        .map((f) => ({
          ...f,
          valor: (f.valor / 100).toFixed(2).replace(".", ","),
        })),
    ),
    [duplicar, setDuplicar] = useState(false),
    [destino, setDestino] = useState(""),
    [sample, setSample] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const previewCentavos = (valor: string) => {
    try {
      return paraCentavos(valor);
    } catch {
      return 0;
    }
  };
  const excluidos = fixos
    .filter((f) => f.natureza !== "operacional")
    .reduce((s, f) => s + previewCentavos(f.valor), 0);
  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const ok = atualizar((draft) => {
      const d = draft.dnas.find((x) => x.id === dna.id)!;
      Object.assign(d, {
        cmvReal:
          formString(data, "cmvReal") === ""
            ? undefined
            : paraCentavos(formString(data, "cmvReal")),
        variaveisReais:
          formString(data, "variaveisReais") === ""
            ? undefined
            : paraCentavos(formString(data, "variaveisReais")),
        faturamento: paraCentavos(formString(data, "faturamento")),
        tipoFaturamento: formString(data, "tipo"),
        imposto: formNumber(data, "imposto"),
        margem: formNumber(data, "margem"),
        fixos: fixos.map((f) => ({ ...f, valor: paraCentavos(f.valor) })),
      });
    });
    if (ok) setDirty(false);
  }
  function duplicate() {
    if (!destino || destino === mes) {
      avisar("Escolha uma competência diferente da atual.");
      return;
    }
    if (
      db.dnas.some(
        (d) => d.restaurante_id === restaurante.id && d.competencia === destino,
      )
    ) {
      avisar(
        "Já existe um DNA nessa competência. Escolha um mês sem cadastro para preservar os dados.",
      );
      return;
    }
    if (
      atualizar((draft) => {
        draft.dnas.push({
          ...structuredClone(dna),
          id: crypto.randomUUID(),
          competencia: destino,
          historico: false,
          fixos: dna.fixos
            .filter((f) => f.id !== "rateio-aluguel")
            .map((f) => ({ ...f, id: crypto.randomUUID() })),
        });
        const canais = draft.canais.filter(
          (c) => c.restaurante_id === restaurante.id && c.competencia === mes,
        );
        draft.canais = draft.canais.filter(
          (c) =>
            !(c.restaurante_id === restaurante.id && c.competencia === destino),
        );
        draft.canais.push(
          ...canais.map((c) => ({
            ...structuredClone(c),
            id: crypto.randomUUID(),
            competencia: destino,
            taxas: c.taxas.map((t) => ({ ...t, id: crypto.randomUUID() })),
          })),
        );
      }, "DNA e taxas de canais duplicados. Preços praticados não foram copiados.")
    ) {
      setDuplicar(false);
      selecionar(restaurante.id, destino);
    }
  }
  return (
    <>
      <div className="section-toolbar">
        <div className="notice inline">
          Apenas custos de natureza <strong>operacional</strong> entram no DNA.
        </div>
        <button className="button" onClick={() => setDuplicar(true)}>
          <Copy size={16} />
          Duplicar mês salvo
        </button>
      </div>
      {dna.historico && (
        <div className="notice warning">
          Histórico abr/2025, não atual. Imposto e taxas não foram fornecidos:
          revise-os antes de usar.
        </div>
      )}
      <form
        ref={formRef}
        data-dirty={dirty ? "true" : "false"}
        onChange={() => setDirty(true)}
        onBlur={() => {
          if (formRef.current?.checkValidity()) formRef.current.requestSubmit();
        }}
        onSubmit={save}
      >
        <Panel
          title="A base financeira do mês"
          subtitle="Valores em reais. As taxas são informadas em percentual."
        >
          <div className="form-grid four">
            <Field label="Faturamento de referência (R$)">
              <Money name="faturamento" value={dna.faturamento} />
            </Field>
            <Field label="Tipo de referência">
              <select name="tipo" defaultValue={dna.tipoFaturamento}>
                <option value="meta">Meta de faturamento</option>
                <option value="realizado">Faturamento realizado</option>
              </select>
            </Field>
            <Field label="Alíquota efetiva de imposto (%)">
              <Numeric
                name="imposto"
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                defaultValue={dna.imposto}
              />
            </Field>
            <Field label="Meta de margem líquida (%)">
              <Numeric
                name="margem"
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                defaultValue={dna.margem}
              />
            </Field>
          </div>
          <div className="form-grid">
            <Field label="CMV total do mês (R$), vazio = pendente">
              <input
                name="cmvReal"
                inputMode="decimal"
                defaultValue={
                  dna.cmvReal === undefined
                    ? ""
                    : (dna.cmvReal / 100).toFixed(2).replace(".", ",")
                }
              />
            </Field>
            <Field label="Custos variáveis do mês (R$), sem impostos, vazio = pendente">
              <input
                name="variaveisReais"
                inputMode="decimal"
                defaultValue={
                  dna.variaveisReais === undefined
                    ? ""
                    : (dna.variaveisReais / 100).toFixed(2).replace(".", ",")
                }
              />
            </Field>
          </div>
          <p className="field-help">
            O regime tributário não define a alíquota automaticamente. Informe a
            alíquota efetiva com orientação do seu contador.
          </p>
        </Panel>
        <Panel
          title="Custos fixos"
          subtitle="Separe despesas operacionais de amortização de dívidas."
        >
          <div className="fixed-list">
            {fixos.map((f, idx) => (
              <div className="fixed-row" key={f.id}>
                <Field label="Categoria">
                  <input
                    required
                    maxLength={80}
                    value={f.categoria}
                    onChange={(e) =>
                      setFixos((rows) =>
                        rows.map((r, i) =>
                          i === idx ? { ...r, categoria: e.target.value } : r,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="Descrição">
                  <input
                    required
                    maxLength={120}
                    value={f.descricao}
                    onChange={(e) =>
                      setFixos((rows) =>
                        rows.map((r, i) =>
                          i === idx ? { ...r, descricao: e.target.value } : r,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="Valor (R$)">
                  <Numeric
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    max="99999999999"
                    value={f.valor}
                    onChange={(e) =>
                      setFixos((rows) =>
                        rows.map((r, i) =>
                          i === idx ? { ...r, valor: e.target.value } : r,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="Natureza">
                  <select
                    value={f.natureza}
                    onChange={(e) =>
                      setFixos((rows) =>
                        rows.map((r, i) =>
                          i === idx
                            ? {
                                ...r,
                                natureza: e.target
                                  .value as CustoFixo["natureza"],
                              }
                            : r,
                        ),
                      )
                    }
                  >
                    <option value="operacional">Operacional</option>
                    <option value="amortizacao">Amortização de dívida</option>
                    <option value="outro">Outro</option>
                  </select>
                </Field>
                <button
                  type="button"
                  className="icon-button danger"
                  aria-label={`Remover ${f.descricao || "custo fixo"}`}
                  onClick={() => {
                    if (confirm("Excluir este custo fixo?")) {
                      setDirty(true);
                      setFixos((rows) => rows.filter((r) => r.id !== f.id));
                    }
                  }}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="button"
            onClick={() =>
              setFixos((rows) => [
                ...rows,
                {
                  id: crypto.randomUUID(),
                  categoria: "",
                  descricao: "",
                  valor: "0.00",
                  natureza: "operacional",
                },
              ])
            }
          >
            <Plus size={17} />
            Adicionar custo fixo
          </button>
          <div className="cost-summary">
            <span>
              Operacionais{" "}
              <strong>
                {dinheiro(
                  fixos
                    .filter((f) => f.natureza === "operacional")
                    .reduce((s, f) => s + previewCentavos(f.valor), 0),
                )}
              </strong>
            </span>
            <span>
              Fora do cálculo <strong>{dinheiro(excluidos)}</strong>
            </span>
          </div>
        </Panel>
        <div className="form-actions">
          <span className="muted">
            {dirty
              ? "Alterações ainda não salvas. Complete os campos para salvar."
              : "Salvo no navegador. Autosave ao sair de um campo válido."}
          </span>
          <button className="button primary" type="submit">
            Salvar DNA mensal <ArrowRight size={17} />
          </button>
        </div>
      </form>
      <div className="saved-overview">
        <h3>Indicadores do DNA salvo</h3>
        <OverviewIndicators />
      </div>
      {restaurante.id === "a-vila" && (
        <div className="sample-bar">
          <p>Quer explorar os números fornecidos de A Vila?</p>
          <button className="text-button" onClick={() => setSample(true)}>
            Carregar histórico abr/2025 <ArrowUpRight size={15} />
          </button>
        </div>
      )}
      {duplicar && (
        <Modal title="Duplicar DNA mensal" close={() => setDuplicar(false)}>
          <p className="modal-copy">
            Copia o DNA salvo e as taxas dos canais para um mês sem cadastro.
            Insumos e fichas são compartilhados entre competências.
          </p>
          <Field label="Competência de destino">
            <input
              type="month"
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
            />
          </Field>
          <div className="form-actions">
            <button className="button" onClick={() => setDuplicar(false)}>
              Cancelar
            </button>
            <button className="button primary" onClick={duplicate}>
              Duplicar DNA
            </button>
          </div>
        </Modal>
      )}
      {sample && (
        <Modal
          title="Carregar histórico de A Vila"
          close={() => setSample(false)}
        >
          <p className="modal-copy">
            Histórico abr/2025, não atual. Não altera a competência atual.
            Inclui R$ 46.400 em despesas operacionais e R$ 5.000 em amortização
            fora do cálculo.
          </p>
          <button
            className="button primary"
            onClick={() => {
              if (
                db.dnas.some(
                  (d) =>
                    d.restaurante_id === "a-vila" &&
                    d.competencia === "2025-04",
                )
              ) {
                avisar(
                  "Abril/2025 já existe. Selecione a competência para consultar sem sobrescrever.",
                );
                setSample(false);
                return;
              }
              if (
                atualizar((draft) => {
                  draft.dnas.push(historicoVila());
                  draft.canais.push(...novosCanais("a-vila", "2025-04"));
                }, "Histórico carregado.")
              ) {
                setSample(false);
                selecionar("a-vila", "2025-04");
              }
            }}
          >
            Carregar e abrir abril/2025
          </button>
        </Modal>
      )}
    </>
  );
}
function OverviewIndicators() {
  const { dna, db, restaurante } = useSistema();
  return (
    <div className="channel-indicators">
      {db.canais
        .filter(
          (c) =>
            c.restaurante_id === restaurante.id &&
            c.competencia === dna.competencia,
        )
        .map((c) => {
          const r = calcularPrecoDNA({
            faturamentoReferencia: dna.faturamento,
            custosFixosOperacionais: fixosOperacionais(dna),
            variaveis: taxaCanal(c),
            impostos: dna.imposto / 100,
            margem: dna.margem / 100,
            cmvIngredientes: 0,
          });
          return (
            <div
              key={c.id}
              className={`mini-card ${!r.viavel ? "invalid" : ""}`}
            >
              <h3>{c.nome}</h3>
              {r.viavel ? (
                <>
                  <p>
                    Fixos <strong>{percentual(r.percentualFixos)}</strong>
                  </p>
                  <p>
                    CMV máximo{" "}
                    <strong>{percentual(r.cmvMaximoPercentual)}</strong>
                  </p>
                  <p>
                    Markup{" "}
                    <strong>
                      {r.markup.toLocaleString("pt-BR", {
                        maximumFractionDigits: 3,
                      })}
                      ×
                    </strong>
                  </p>
                </>
              ) : (
                <p>{r.motivo}</p>
              )}
            </div>
          );
        })}
    </div>
  );
}
