"use client";
import { insumoArquivado } from "@/lib/insumos";
import { useState } from "react";
import { Building2, ChartColumnIncreasing, Settings2 } from "lucide-react";
import { preparoPendente } from "./readiness";
import {
  consolidar,
  operacoes,
  rateioAluguel,
  operacoesDoAluguel,
  insumosMes,
  dnaComRateio,
} from "@/lib/v2";
import { dinheiro, percentual, paraCentavos } from "@/lib/dna";
import { demonstrativo } from "@/lib/financeiro";
import { useSistema } from "./context";
import { Field, Modal, Money, Panel, formNumber, formString } from "./ui";
import { Numeric } from "./numeric";
import { VendasAnotai } from "./vendas-anotai";
import { VendasEstimadasSetor } from "./vendas-estimadas-setor";
export function Vila() {
  const { db, mes, atualizar, selecionar, ir } = useSistema(),
    [config, setConfig] = useState(false),
    [regra, setRegra] = useState<"fixo" | "faturamento">(
      db.alugueis?.find((a) => a.competencia === mes)?.regra ?? "faturamento",
    );
  const c = consolidar(db, mes);
  const aluguel = db.alugueis?.find((a) => a.competencia === mes);
  const { criterio } = rateioAluguel(db, mes);
  const participantes = operacoesDoAluguel(db);
  const receitaPorSetor = c.rows.reduce((total, r) => total + (r.receita ?? 0), 0);
  const meses = [...new Set([
    ...db.dnas.map((d) => d.competencia),
    ...(db.fechamentosFinanceiros ?? []).map((f) => f.competencia),
    ...(db.faturamentosConsolidados ?? []).map((f) => f.competencia),
  ])].filter((data) => data <= mes).sort().slice(-12);
  const historico = meses.map((data) => ({ data, dre: demonstrativo(db, data, "a-vila") }));
  const maiorReceita = Math.max(1, ...historico.map(({ dre }) => dre.receita ?? 0));
  const receitaAnotai = c.receitaAnotai;
  const metrics = [
    [receitaAnotai ? "Receita registrada no Anotaí" : "Receita após abatimentos", c.receita === null ? "Pendente" : dinheiro(c.receita)],
    ["Margem operacional", c.margem === null ? "Pendente" : percentual(c.margem)],
    [
      "CMV consolidado",
      c.cmv === null || !c.receita || c.receitaParcial
        ? "Pendente" : percentual(c.cmv / c.receita),
    ],
    ["Fixos cadastrados com aluguel", dinheiro(c.fixos)],
    ["Ponto de equilíbrio", c.equilibrio === null ? "Pendente" : dinheiro(c.equilibrio)],
    ["Resultado operacional", c.lucro === null ? "Pendente" : dinheiro(c.lucro)],
  ];
  return (
    <div className="consolidado-workspace">
      <div className="consolidado-summary">
        <div>
          <span className="consolidado-label"><Building2 size={16} aria-hidden="true" /> Todas as operações</span>
          <h2>Visão geral da Vila</h2>
          <p>{c.rows.map(({ nome }) => nome).join(" · ")}</p>
        </div>
        <div className="reports-overview-actions">
          <button type="button" className="button cream" onClick={() => ir("relatorios")}>
            <ChartColumnIncreasing size={16} aria-hidden="true" />
            Relatórios
          </button>
          <button type="button" className="button cream" onClick={() => {
            setRegra(aluguel?.regra ?? "faturamento");
            setConfig(true);
          }}>
            <Settings2 size={16} aria-hidden="true" />
            Aluguel e rateio
          </button>
        </div>
      </div>
      <details className="panel vendas-disclosure">
        <summary>Ver estimativa de vendas (não realizada)</summary>
        <VendasEstimadasSetor setor="a-vila" />
      </details>
      <details className="panel vendas-disclosure">
        <summary>Ver totais por canal e histórico da Vila (sem separar por setor)</summary>
        <VendasAnotai detalhado />
      </details>
      <h2 className="vila-dna-indicadores">Financeiro e DRE do mês</h2>
      <div className="consolidado-metrics">
        {metrics.map(([label, value]) => (
          <div className="stat" key={label}>
            <span>{label}</span>
            <strong
              className={
                label === "Margem operacional" && c.margem !== null
                  ? c.margem < 0
                    ? "negative"
                    : "positive"
                  : ""
              }
            >
              {value}
            </strong>
            {label === "Ponto de equilíbrio" && (
              <button type="button" className="text-button" onClick={() => ir("equilibrio")}>
                Abrir ponto de equilíbrio
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="notice">
        <p>
          Margem e resultado vêm do DRE da competência. Os fixos cadastrados incluem o aluguel e podem conter estimativas.{" "}
          <button type="button" className="text-button" onClick={() => ir("dre")}>Ver DRE do mês</button>
        </p>
        {receitaAnotai && (
          <p>
            A receita do Anotaí é o subtotal dos pedidos finalizados, sem frete.
            {receitaAnotai.periodoAte && ` Dados até ${receitaAnotai.periodoAte.slice(8, 10)}/${receitaAnotai.periodoAte.slice(5, 7)}.`}
            {receitaAnotai.coberturaSalao === "ausente" && " Sem cobertura do salão."}
            {receitaAnotai.coberturaSalao === "parcial" && " Cobertura parcial do salão."}
          </p>
        )}
        {criterio === "fixo-provisorio" && <p>Aluguel rateado pelos percentuais cadastrados enquanto falta faturamento realizado por setor.</p>}
        {criterio === "igual-provisorio" && <p>Aluguel provisoriamente dividido em partes iguais entre as operações participantes. O rateio usa o faturamento realizado quando todos os valores estiverem disponíveis.</p>}
      </div>
      <Panel
        title="Receita no DRE por operação"
        subtitle="Valores realizados no DRE de cada operação."
      >
        {c.rows.some((r) => r.receita === null) && (
          <p className="empty-chart">Os setores com receita pendente ficam sem barra até completar o DRE.</p>
        )}
        {c.rows.map((r, idx) => (
          <div className="comparison" key={r.id}>
            <button className="text-button" onClick={() => selecionar(r.id)}>
              {r.nome}
            </button>
            <div className="chart-track" aria-hidden="true">
              <div
                style={{
                  width: `${receitaPorSetor ? Math.max(0, r.receita ?? 0) / receitaPorSetor * 100 : 0}%`,
                  background: ["#234f42", "#d7ad66", "#8ea69a"][idx % 3],
                }}
              />
            </div>
            <strong>{r.receita === null ? "Pendente" : dinheiro(r.receita)}</strong>
            <small className={r.margem === null ? "" : r.margem < 0 ? "negative" : "positive"}>
              {r.margem === null ? "Margem pendente" : `Margem ${percentual(r.margem)}`}
              {" · "}Fixos cadastrados {dinheiro(r.fixos)}
              {" · "}Aluguel {r.aluguel === null ? "pendente" : dinheiro(r.aluguel)}
            </small>
          </div>
        ))}
      </Panel>
      <Panel
        title="Evolução mês a mês"
        subtitle="Receita registrada e margem operacional do DRE."
      >
        {historico.every(({ dre }) => dre.receita === null) ? (
          <p className="empty-chart">Sem receita registrada para comparar os meses.</p>
        ) : (
          <div className="month-chart">
            {historico.map(({ data, dre }) => (
              <div key={data} className="month-bar">
                <strong>{dre.receita === null ? "Pendente" : dinheiro(dre.receita)}</strong>
                <div className="column-track" aria-hidden="true">
                  <div style={{ height: `${Math.max(0, dre.receita ?? 0) / maiorReceita * 100}%` }} />
                </div>
                <span>
                  {new Intl.DateTimeFormat("pt-BR", {
                    month: "short",
                    year: "2-digit",
                    timeZone: "UTC",
                  }).format(new Date(data + "-01T12:00:00Z"))}
                </span>
                <small>
                  {dre.receitaParcial ? "Receita parcial" : dre.margem === null
                    ? "Margem pendente" : percentual(dre.margem)}
                </small>
              </div>
            ))}
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
                    percentuais: regra === "fixo"
                      ? Object.fromEntries(participantes.map((r) => [r.id, formNumber(f, r.id)]))
                      : aluguel?.percentuais ?? {},
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
                  Proporcional ao faturamento realizado
                </option>
                <option value="fixo">Percentuais fixos (total 100%)</option>
              </select>
            </Field>
            {regra === "fixo" &&
              participantes.map((r) => (
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
              O rateio exclui Vinhos. Quando o faturamento realizado está incompleto,
              o rateio usa os percentuais cadastrados ou divide o aluguel em partes iguais.
            </p>
            <button className="button primary">Aplicar rateio</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
