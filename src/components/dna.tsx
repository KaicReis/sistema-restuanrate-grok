"use client";
import { confirmarExclusao } from "./ui";
import { preparoPendente } from "./readiness";
import { useCloud } from "./cloud";
import { insumoArquivado } from "@/lib/insumos";
import { insumosMes } from "@/lib/v2";
import { Numeric } from "./numeric";
import { useState, useRef, useEffect } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Circle,
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
import { dnaParaPrecificacao } from "@/lib/base-precificacao";
import { useSistema } from "./context";
import { VendasEstimadasSetor } from "./vendas-estimadas-setor";
import { Field, Money, Panel, Modal, formNumber, formString } from "./ui";
export function Overview() {
  const { db, dna, restaurante, ir } = useSistema();
  const [canalId, setCanal] = useState("");
  const canais = db.canais.filter(
    (c) => c.restaurante_id === restaurante.id && c.competencia === dna.competencia,
  );
  const canal = canais.find((c) => c.id === canalId) ?? canais[0];
  const fixos = fixosOperacionais(dna);
  const faturamentoPrecificacao = dnaParaPrecificacao(db, dna).faturamento;
  const result = calcularPrecoDNA({
    faturamentoReferencia: faturamentoPrecificacao,
    custosFixosOperacionais: fixos,
    variaveis: canal ? taxaCanal(canal) : 0,
    impostos: dna.imposto / 100,
    margem: dna.margem / 100,
    cmvIngredientes: 0,
  });
  const produtos = db.produtos.filter((p) => p.restaurante_id === restaurante.id);
  const insumos = insumosMes(db, dna.competencia).filter(
    (i) => i.restaurante_id === restaurante.id,
  );
  const receitas = (db.receitas ?? []).filter((r) => r.restaurante_id === restaurante.id);
  const pendencias = [
    {
      label: "Insumos sem preço",
      total: insumos.filter((i) => i.precoPendente && !insumoArquivado(i)).length,
      page: "insumos" as const,
    },
    {
      label: "Fichas incompletas",
      total: produtos.filter((p) => preparoPendente(db, dna.competencia, p)).length,
      page: "fichas" as const,
    },
    {
      label: "Receitas a confirmar",
      total: receitas.filter((r) => preparoPendente(db, dna.competencia, r, true)).length,
      page: "receitas" as const,
    },
  ];
  const parts = result.viavel
    ? [
        { name: "Fixos operacionais", value: result.percentualFixos, color: "#17483b" },
        { name: "Custos variáveis", value: canal ? taxaCanal(canal) : 0, color: "#4e8479" },
        { name: "Impostos", value: dna.imposto / 100, color: "#8e8277" },
        { name: "Meta de lucro", value: dna.margem / 100, color: "#c89743" },
        { name: "CMV disponível", value: result.cmvMaximoPercentual, color: "#8da86d" },
      ]
    : [];

  return (
    <div className="overview-page">
      <details className="panel vendas-disclosure">
        <summary>Ver estimativa de vendas (não realizada)</summary>
        <VendasEstimadasSetor setor={restaurante.id} />
      </details>
      {dna.historico && (
        <p className="notice warning">Dados históricos de abril de 2025, usados para demonstração.</p>
      )}
      <section className="overview-finances" aria-labelledby="overview-finances-title">
        <header className="overview-finances-head">
          <div>
            <h2 id="overview-finances-title">Planejamento e precificação</h2>
            <p>{restaurante.nome}</p>
          </div>
          <button type="button" className="button" onClick={() => ir("dna")}>
            {dna.faturamento ? "Revisar DNA do mês" : "Configurar DNA do mês"}
          </button>
        </header>
        <div className="overview-metrics">
          <Stat
            label="Base de faturamento para precificação"
            value={faturamentoPrecificacao ? dinheiro(faturamentoPrecificacao) : "Não informado"}
            note={db.basesPrecificacao?.some((base) => base.restaurante_id === restaurante.id && base.modo !== "mensal") ? "Base fixa da operação" : "Referência do DNA do mês"}
            icon={<CircleDollarSign />}
          />
          <Stat
            label="Fixos operacionais"
            value={dinheiro(fixos)}
            note={
              faturamentoPrecificacao
                ? `${percentual(fixos / faturamentoPrecificacao)} da base de precificação`
                : "Informe o faturamento para comparar"
            }
            icon={<Wallet />}
          />
          <Stat
            label="Meta de margem líquida"
            value={percentual(dna.margem / 100)}
            note="Sobre a receita bruta"
            icon={<Target />}
          />
          <Stat
            label="CMV máximo"
            value={result.viavel ? percentual(result.cmvMaximoPercentual) : "—"}
            note={canal ? `Canal de venda · ${canal.nome}` : "Cadastre um canal de venda"}
            icon={<TrendingUp />}
            accent
          />
        </div>
      </section>

      <div className="overview-body">
        <Panel
          title="Para onde vão R$ 100 do faturamento?"
          subtitle="Distribuição por canal de venda."
          action={
            <select
              aria-label="Canal para distribuição"
              value={canal?.id ?? ""}
              onChange={(e) => setCanal(e.target.value)}
              disabled={!canais.length}
            >
              {canais.length ? canais.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              )) : <option value="">Sem canais</option>}
            </select>
          }
        >
          {result.viavel ? (
            <>
              <div className="overview-allocation" aria-hidden="true">
                {parts.map(({ name, value, color }) => (
                  <span key={name} style={{ flexGrow: value, backgroundColor: color }} />
                ))}
              </div>
              <dl className="overview-allocation-legend">
                {parts.map(({ name, value, color }) => (
                  <div key={name}>
                    <dt><i style={{ backgroundColor: color }} />{name}</dt>
                    <dd>{dinheiro(value * 10000)}</dd>
                  </div>
                ))}
              </dl>
              <p className="overview-allocation-note">
                O CMV disponível cobre ingredientes, embalagem e custo por unidade do canal.
              </p>
            </>
          ) : (
            <div className="overview-empty">
              <Target size={24} aria-hidden="true" />
              <div>
                <h3>{faturamentoPrecificacao ? "A margem desejada não cabe neste cenário" : "Defina a receita de referência"}</h3>
                <p>
                  {faturamentoPrecificacao
                    ? "Revise faturamento, despesas ou taxas para calcular quanto sobra para o custo direto."
                    : "Informe o faturamento e as despesas para ver como cada R$ 100 são distribuídos."}
                </p>
                <button type="button" className="text-button" onClick={() => ir("dna")}>
                  Ajustar DNA
                </button>
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Cadastros para revisar" subtitle="Abra a lista filtrada de cada pendência.">
          <ul className="overview-reviews">
            {pendencias.map(({ label, total, page }) => (
              <li key={page}>
                <button type="button" onClick={() => ir(page, "pendentes")}>
                  <span>{label}</span>
                  <strong className={total ? "has-pending" : ""}>{total}</strong>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Da configuração à precificação">
        <div className="overview-checklist">
          {[
            {
              title: "DNA do mês",
              text: "Receita, despesas e meta de margem",
              done: faturamentoPrecificacao > 0,
              page: "dna" as const,
            },
            {
              title: "Insumos",
              text: "Preços de compra e rendimento",
              done: insumos.length > 0,
              page: "insumos" as const,
            },
            {
              title: "Fichas técnicas",
              text: "Custo de cada produto por porção",
              done: produtos.length > 0,
              page: "fichas" as const,
            },
            {
              title: "Precificação",
              text: "Margem e preços em cada canal",
              done: db.precos.some((p) => p.restaurante_id === restaurante.id),
              page: "precos" as const,
            },
          ].map(({ title, text, done, page }) => (
            <button type="button" key={page} onClick={() => ir(page)}>
              <span className={done ? "is-started" : ""} aria-label={done ? "Dados cadastrados" : "A configurar"}>
                {done ? <Check size={16} aria-hidden="true" /> : <Circle size={14} aria-hidden="true" />}
              </span>
              <div>
                <strong>{title}</strong>
                <small>{text}</small>
              </div>
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          ))}
        </div>
      </Panel>
    </div>
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
    <div className={`overview-stat${accent ? " is-accent" : ""}`}>
      <span className="overview-stat-icon" aria-hidden="true">{icon}</span>
      <div>
        <h3>{label}</h3>
        <strong>{value}</strong>
        <p>{note}</p>
      </div>
    </div>
  );
}
export function DNAEditor() {
  const cloud = useCloud();
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
            recebimentos: c.recebimentos?.map((regra) => ({ ...regra, id: crypto.randomUUID() })),
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
                    moeda
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
                  onClick={async () => {
                    if (await confirmarExclusao(f.descricao || "Custo fixo")) {
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
              : `${cloud.mode === "cloud" ? "Salvo na nuvem" : "Salvo neste navegador"}. Autosave ao sair de um campo válido.`}
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
          const faturamentoPrecificacao = dnaParaPrecificacao(db, dna).faturamento;
          const r = calcularPrecoDNA({
            faturamentoReferencia: faturamentoPrecificacao,
            custosFixosOperacionais: fixosOperacionais(dna),
            variaveis: taxaCanal(c),
            impostos: dna.imposto / 100,
            margem: dna.margem / 100,
            cmvIngredientes: 0,
          });
          return (
            <div
              key={c.id}
              className={`mini-card ${faturamentoPrecificacao && !r.viavel ? "invalid" : ""}`}
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
                <p>{faturamentoPrecificacao ? r.motivo : "Informe a base de faturamento"}</p>
              )}
            </div>
          );
        })}
    </div>
  );
}
