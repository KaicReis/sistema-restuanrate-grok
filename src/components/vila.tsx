"use client";
import { insumoArquivado } from "@/lib/insumos";
import { useState } from "react";
import { Building2, ChartColumnIncreasing, Settings2 } from "lucide-react";
import { preparoPendente } from "./readiness";
import {
  consolidar,
  operacoes,
  ratear,
  insumosMes,
  dnaComRateio,
} from "@/lib/v2";
import { dinheiro, percentual, paraCentavos } from "@/lib/dna";
import { useSistema } from "./context";
import { Field, Modal, Money, Panel, formNumber, formString } from "./ui";
import { Numeric } from "./numeric";
export function Vila() {
  const { db, mes, atualizar, selecionar, ir } = useSistema(),
    [config, setConfig] = useState(false),
    [regra, setRegra] = useState<"fixo" | "faturamento">(
      db.alugueis?.find((a) => a.competencia === mes)?.regra ?? "faturamento",
    );
  const c = consolidar(db, mes),
    aluguel = db.alugueis?.find((a) => a.competencia === mes),
    rateio = ratear(db, mes),
    meses = Array.from(new Set(db.dnas.map((d) => d.competencia)))
      .sort()
      .slice(-12);
  const operacaoPendente = c.rows.find((r) => {
    const dna = dnaComRateio(db, r.id, mes);
    return (
      !dna.faturamento ||
      dna.cmvReal === undefined ||
      dna.variaveisReais === undefined
    );
  });
  const dnaPendente = operacaoPendente
    ? dnaComRateio(db, operacaoPendente.id, mes)
    : null;
  const camposPendentes = dnaPendente
    ? [
        !dnaPendente.faturamento && "faturamento",
        dnaPendente.cmvReal === undefined && "CMV mensal",
        dnaPendente.variaveisReais === undefined && "custos variáveis",
      ]
        .filter(Boolean)
        .join(", ")
    : "receita suficiente para cobrir os custos";
  const metrics = [
    ["Faturamento de referência", dinheiro(c.receita)],
    [
      "Margem gerencial / meta 30%",
      c.margem === null ? "Pendente" : percentual(c.margem),
    ],
    [
      "CMV consolidado",
      c.cmv === null || !c.receita ? "Pendente" : percentual(c.cmv / c.receita),
    ],
    ["Custos fixos com rateio", dinheiro(c.fixos)],
    [
      "Ponto de equilíbrio · referência do DNA",
      c.equilibrio === null ? "Pendente" : dinheiro(c.equilibrio),
    ],
    ["Resultado de referência · DNA", c.lucro === null ? "Pendente" : dinheiro(c.lucro)],
  ];
  return (
    <div className="consolidado-workspace">
      <div className="consolidado-summary">
        <div>
          <span className="consolidado-label"><Building2 size={16} aria-hidden="true" /> Todas as operações</span>
          <h2>Resultados do grupo</h2>
          <p>{c.rows.map(({ nome }) => nome).join(" · ")}</p>
        </div>
        <div className="reports-overview-actions">
          <button type="button" className="button cream" onClick={() => ir("relatorios")}>
            <ChartColumnIncreasing size={16} aria-hidden="true" />
            Relatórios de custos
          </button>
          <button type="button" className="button cream" onClick={() => setConfig(true)}>
            <Settings2 size={16} aria-hidden="true" />
            Aluguel e rateio
          </button>
        </div>
      </div>
      <div className="consolidado-metrics">
        {metrics.map(([label, value]) => (
          <div className="stat" key={label}>
            <span>{label}</span>
            <strong
              className={
                label.startsWith("Margem") && c.margem !== null
                  ? c.margem < 0.3
                    ? "negative"
                    : "positive"
                  : ""
              }
            >
              {value}
            </strong>
            {label.startsWith("Ponto de equilíbrio") ? (
              <button type="button" className="text-button" onClick={() => ir("equilibrio")}>
                Abrir ponto de equilíbrio
              </button>
            ) : value === "Pendente" && (
              <button
                className="text-button"
                onClick={() => {
                  const r = operacaoPendente ?? c.rows[0];
                  if (r) {
                    selecionar(r.id);
                    ir("dna");
                  }
                }}
              >
                {operacaoPendente ? `Completar DNA de ${operacaoPendente.nome}` : "Revisar DNA"}
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="notice">
        {operacaoPendente && <p><strong>{operacaoPendente.nome}</strong> precisa informar {camposPendentes} no DNA.</p>}
        Faturamento é a referência informada no DNA de cada operação (meta ou
        realizado). CMV, margem e equilíbrio exigem custos mensais informados;
        fichas técnicas e preços sozinhos não representam vendas realizadas.
        Margem = receita − CMV − variáveis − impostos − fixos.
      </div>
      <Panel
        title="Faturamento por operação"
        subtitle="Comparativo e participação no grupo"
      >
        {!c.receita && (
          <p className="empty-chart">
            Informe o faturamento no DNA das operações para visualizar o
            gráfico.
          </p>
        )}
        {c.rows.map((r, idx) => (
          <div className="comparison" key={r.id}>
            <button className="text-button" onClick={() => selecionar(r.id)}>
              {r.nome} ↗
            </button>
            <div className="chart-track">
              <div
                style={{
                  width: `${c.receita ? (r.receita / c.receita) * 100 : 0}%`,
                  background: ["#234f42", "#d7ad66", "#8ea69a"][idx % 3],
                }}
              />
            </div>
            <strong>{dinheiro(r.receita)}</strong>
            <small
              className={
                r.margem === null
                  ? ""
                  : r.margem < 0.3
                    ? "negative"
                    : "positive"
              }
            >
              {r.tipo} ·{" "}
              {r.margem === null
                ? "Margem pendente"
                : `Margem ${percentual(r.margem)}`}{" "}
              · Fixos {dinheiro(r.fixos)} · Aluguel{" "}
              {dinheiro(rateio[r.id] ?? 0)}
            </small>
          </div>
        ))}
      </Panel>
      <Panel
        title="Evolução mês a mês"
        subtitle="Faturamento consolidado e margem gerencial"
      >
        {!meses.some((m) => consolidar(db, m).receita > 0) ? (
          <p className="empty-chart">
            Sem faturamento informado para comparar os meses.
          </p>
        ) : (
          <div className="month-chart">
            {meses.map((m) => {
              const v = consolidar(db, m),
                max = Math.max(
                  ...meses.map((m) => consolidar(db, m).receita),
                  1,
                );
              return (
                <div key={m} className="month-bar">
                  <strong>{dinheiro(v.receita)}</strong>
                  <div className="column-track">
                    <div style={{ height: `${(v.receita / max) * 100}%` }} />
                  </div>
                  <span>
                    {new Intl.DateTimeFormat("pt-BR", {
                      month: "short",
                      year: "2-digit",
                      timeZone: "UTC",
                    }).format(new Date(m + "-01T12:00:00Z"))}
                  </span>
                  <small>
                    {v.margem === null
                      ? "Margem pendente"
                      : percentual(v.margem)}
                  </small>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
      <Panel title="Alertas e pendências">
        {c.alertas.map((a, i) => (
          <p className="negative" key={i}>
            {a}
          </p>
        ))}
        {!c.alertas.length && (
          <p>Nenhum alerta calculável nesta competência.</p>
        )}
        {operacoes(db).map((r) => {
          const dna = dnaComRateio(db, r.id, mes);
          const faltas = [
            !dna.faturamento && "faturamento",
            dna.cmvReal === undefined && "CMV mensal",
            dna.variaveisReais === undefined && "custos variáveis",
          ].filter(Boolean);
          return (
            <div className="operation-pending" key={r.id}>
              <strong>{r.nome}</strong>
              {faltas.length > 0 && (
                <p>
                  Falta informar: {faltas.join(", ")}.{" "}
                  <button
                    className="text-button"
                    onClick={() => {
                      selecionar(r.id);
                      ir("dna");
                    }}
                  >
                    Completar DNA ↗
                  </button>
                </p>
              )}
              {(["insumos", "fichas", "receitas"] as const).map((page) => {
                const count =
                  page === "insumos"
                    ? insumosMes(db, mes).filter(
                        (i) => i.restaurante_id === r.id && i.precoPendente && !insumoArquivado(i),
                      ).length
                    : (page === "fichas"
                        ? db.produtos
                        : (db.receitas ?? [])
                      ).filter(
                        (p) =>
                          p.restaurante_id === r.id &&
                          preparoPendente(db, mes, p, page === "receitas"),
                      ).length;
                return (
                  <button
                    className="button"
                    key={page}
                    onClick={() => {
                      selecionar(r.id);
                      ir(page, "pendentes");
                    }}
                  >
                    {count} {page} pendentes ↗
                  </button>
                );
              })}
            </div>
          );
        })}
        {Boolean(db.legadoV1) && (
          <p className="muted">
            Migração v1 preservada no backup. Cadastros antigos da A Vila foram
            vinculados ao Nativo’s. Revise no backup as despesas antigas da A
            Vila (fora o aluguel), cuja operação não foi presumida.
          </p>
        )}
      </Panel>
      {config && (
        <Modal
          title="Aluguel compartilhado · A Vila"
          close={() => setConfig(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                atualizar((d) => {
                  d.alugueis ??= [];
                  const a = {
                    competencia: mes,
                    valor: paraCentavos(formString(f, "valor")),
                    regra,
                    percentuais: Object.fromEntries(
                      operacoes(db).map((r) => [r.id, formNumber(f, r.id)]),
                    ),
                  };
                  const idx = d.alugueis.findIndex(
                    (a) => a.competencia === mes,
                  );
                  if (idx < 0) d.alugueis.push(a);
                  else d.alugueis[idx] = a;
                }, "Aluguel salvo e rateado nas operações.")
              )
                setConfig(false);
            }}
          >
            <Field label="Aluguel do mês (R$)">
              <Money name="valor" value={aluguel?.valor ?? 0} />
            </Field>
            <Field label="Regra">
              <select
                value={regra}
                onChange={(e) => setRegra(e.target.value as typeof regra)}
              >
                <option value="faturamento">
                  Proporcional ao faturamento do mês
                </option>
                <option value="fixo">Percentuais fixos (total 100%)</option>
              </select>
            </Field>
            {regra === "fixo" &&
              operacoes(db).map((r) => (
                <Field label={`${r.nome} (%)`} key={r.id}>
                  <Numeric
                    required
                    min="0"
                    max="100"
                    name={r.id}
                    defaultValue={aluguel?.percentuais[r.id] ?? 0}
                  />
                </Field>
              ))}
            <p>
              Somente aluguel é compartilhado. Outros custos são cadastrados
              diretamente nas operações. Sem faturamento, o rateio proporcional
              fica pendente.
            </p>
            <button className="button primary">Aplicar rateio</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
