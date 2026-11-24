"use client";

import { useState } from "react";
import {
  Building2,
  CircleAlert,
  Download,
  ReceiptText,
  Wallet,
} from "lucide-react";
import { dinheiro } from "@/lib/dna";
import { montarRelatorio } from "@/lib/relatorios";
import { useSistema } from "./context";
import { Panel } from "./ui";
import { RelatorioInsumos } from "./relatorio-insumos";
import { PedidosRecebidosAnotai } from "./pedidos-recebidos-anotai";
import { FaturamentoMatriz } from "./faturamento-matriz";
import { VendasAnotai } from "./vendas-anotai";
import { VendasEstimadasSetor } from "./vendas-estimadas-setor";

const indicadores = {
  fixos: { nome: "Fixos cadastrados", curto: "Fixos" },
  compras: { nome: "Compras registradas", curto: "Compras" },
  resultado: { nome: "Resultado operacional", curto: "Resultado DRE" },
} as const;
type Indicador = keyof typeof indicadores;
type Relatorio = ReturnType<typeof montarRelatorio>;
type Linha = Relatorio["atual"];

const mesCurto = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});
const mesLongo = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const valorCsv = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
});

function dataMes(mes: string) {
  return new Date(`${mes}-01T12:00:00Z`);
}
function valor(valor: number | null) {
  return valor === null ? "—" : dinheiro(valor);
}
function exportar(relatorio: Relatorio, setor: string) {
  const linhas: (string | number)[][] = [
    ["Seção", "Competência", "Setor", "Indicador", "Valor (R$)", "Quantidade"],
  ];
  const moeda = (numero: number | null) => numero === null ? "" : valorCsv.format(numero / 100);
  for (const mes of relatorio.serie) {
    for (const [indicador, numero] of [
      [indicadores.fixos.nome, mes.fixos],
      [indicadores.compras.nome, mes.compras],
      ["Receita após abatimentos", mes.receita],
      ["CMV realizado", mes.cmv],
      [indicadores.resultado.nome, mes.resultado],
    ] as const) {
      linhas.push(["Evolução", mes.mes, setor, indicador, moeda(numero), ""]);
    }
  }
  for (const item of relatorio.categorias)
    linhas.push(["Categorias de fixos", relatorio.atual.mes, setor, item.nome, moeda(item.valor), ""]);
  for (const item of relatorio.fornecedores)
    linhas.push(["Compras por fornecedor", relatorio.atual.mes, setor, item.nome, moeda(item.valor), item.quantidade]);
  for (const item of relatorio.setores) {
    for (const chave of Object.keys(indicadores) as Indicador[]) {
      linhas.push(["Comparação por setor", relatorio.atual.mes, item.nome, indicadores[chave].nome, moeda(item[chave]), ""]);
    }
  }
  const csv = linhas.map((linha) => linha.map((celula) => {
    const texto = String(celula);
    const seguro = /^\s*[=+\-@]/.test(texto) && !/^-\d+,\d{2}$/.test(texto) ? `'${texto}` : texto;
    return `"${seguro.replaceAll('"', '""')}"`;
  }).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `relatorio-vila-${relatorio.atual.mes}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Evolucao({ serie, atual }: { serie: Linha[]; atual: string }) {
  const [indicador, setIndicador] = useState<Indicador>("fixos");
  const [foco, setFoco] = useState(atual);
  const ponto = serie.find((linha) => linha.mes === foco) ?? serie.at(-1);
  const dados = serie.map((linha) => linha[indicador]).filter((n): n is number => n !== null);
  const max = Math.max(0, ...dados);
  const min = Math.min(0, ...dados);
  const amplitude = max - min || 1;
  const zero = max / amplitude * 100;

  return (
    <Panel title="Evolução mensal" subtitle="Selecione um indicador e toque em um mês para ver o valor.">
      <div className="report-series-options" role="group" aria-label="Indicador da evolução">
        {(Object.keys(indicadores) as Indicador[]).map((chave) => (
          <button
            className="button"
            type="button"
            aria-pressed={indicador === chave}
            key={chave}
            onClick={() => setIndicador(chave)}
          >
            {indicadores[chave].curto}
          </button>
        ))}
      </div>
      {!dados.length ? (
        <p className="report-empty">Sem valores de {indicadores[indicador].nome.toLocaleLowerCase("pt-BR")} no período.</p>
      ) : (
        <>
          <p className="report-point-value" aria-live="polite">
            <span>{ponto && mesLongo.format(dataMes(ponto.mes))}</span>
            <strong>{ponto?.[indicador] == null ? "Sem registro" : dinheiro(ponto[indicador])}</strong>
          </p>
          <div className="report-chart-scroll">
            <div className="report-chart" style={{ minWidth: `${serie.length * 52}px` }}>
              <span className="report-chart-baseline" aria-hidden="true" style={{ top: `calc(9rem * ${zero / 100})` }} />
              {serie.map((linha) => {
                const numero = linha[indicador];
                const altura = Math.abs(numero ?? 0) / amplitude * 100;
                const topo = numero !== null && numero >= 0 ? Math.max(0, zero - altura) : zero;
                return (
                  <button
                    type="button"
                    className="report-column"
                    key={linha.mes}
                    aria-pressed={ponto?.mes === linha.mes}
                    aria-label={`${mesLongo.format(dataMes(linha.mes))}, ${numero === null ? "sem registro" : dinheiro(numero)}`}
                    onClick={() => setFoco(linha.mes)}
                  >
                    <span className="report-column-plot" aria-hidden="true">
                      <span
                        className={`report-column-bar ${numero === null ? "is-missing" : numero < 0 ? "is-loss" : ""}`}
                        style={{ top: `${numero === 0 || numero === null ? Math.min(zero, 98) : topo}%`, height: numero === 0 || numero === null ? "2px" : `${altura}%` }}
                      />
                    </span>
                    <span className="report-column-label">{mesCurto.format(dataMes(linha.mes))}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
      <details className="report-data">
        <summary>Ver valores do período</summary>
        <div className="report-table-wrap">
          <table className="report-table">
            <thead><tr><th scope="col">Mês</th><th scope="col">Fixos</th><th scope="col">Compras</th><th scope="col">Receita</th><th scope="col">CMV</th><th scope="col">Resultado DRE</th></tr></thead>
            <tbody>
              {serie.map((linha) => (
                <tr key={linha.mes}>
                  <th scope="row">{mesCurto.format(dataMes(linha.mes))}</th>
                  <td>{valor(linha.fixos)}</td><td>{valor(linha.compras)}</td>
                  <td>{valor(linha.receita)}</td><td>{valor(linha.cmv)}</td><td>{valor(linha.resultado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Panel>
  );
}

function Ranking({ itens, vazio }: {
  itens: { nome: string; valor: number; quantidade?: number }[];
  vazio: string;
}) {
  const [mostrarTudo, setMostrarTudo] = useState(false);
  if (!itens.length) return <p className="report-empty">{vazio}</p>;
  const max = Math.max(1, ...itens.map(({ valor }) => Math.max(0, valor)));
  return (
    <>
      <ul className="report-ranking">
        {itens.slice(0, mostrarTudo ? undefined : 7).map((item) => (
          <li key={item.nome}>
            <div>
              <span>{item.nome}</span>
              <strong>{dinheiro(item.valor)}</strong>
            </div>
            <span className="report-ranking-track" aria-hidden="true">
              <span style={{ width: `${Math.max(0, item.valor) / max * 100}%` }} />
            </span>
            {item.quantidade !== undefined &&
              <small>{item.quantidade} {item.quantidade === 1 ? "documento" : "documentos"}</small>}
          </li>
        ))}
      </ul>
      {itens.length > 7 && (
        <button type="button" className="text-button report-ranking-more" onClick={() => setMostrarTudo(!mostrarTudo)}>
          {mostrarTudo ? "Mostrar os 7 primeiros" : `Ver todos (${itens.length})`}
        </button>
      )}
    </>
  );
}

export function Relatorios() {
  const { db, mes, restaurante, ir, selecionar } = useSistema();
  const [periodo, setPeriodo] = useState(6);
  const setor = restaurante.id;
  const nome = db.restaurantes.find((item) => item.id === setor)?.nome ?? restaurante.nome;
  const relatorio = montarRelatorio(db, mes, setor, periodo);
  const atual = relatorio.atual;

  return (
    <div className="reports-workspace">
      <FaturamentoMatriz setor={setor} />
      {setor === "a-vila" && <PedidosRecebidosAnotai />}
      <details className="panel vendas-disclosure">
        <summary>Ver estimativa de vendas (não realizada)</summary>
        <VendasEstimadasSetor setor={setor} />
      </details>
      {setor === "a-vila" && (
        <details className="panel vendas-disclosure">
          <summary>Ver conferência e histórico do Anotaí</summary>
          <VendasAnotai detalhado />
        </details>
      )}
      <section className="report-summary" aria-label="Custos e resultado do mês">
        <div className="report-head">
          <div>
            <p className="report-scope">Custos e resultado · {nome}</p>
            <h2>{mesLongo.format(dataMes(mes))}</h2>
          </div>
          <div className="report-controls">
            <label>
              <span>Período dos custos e do DRE</span>
              <select value={periodo} onChange={(e) => setPeriodo(Number(e.target.value))}>
                <option value={3}>3 meses</option>
                <option value={6}>6 meses</option>
                <option value={12}>12 meses</option>
              </select>
            </label>
            <button type="button" className="button" onClick={() => exportar(relatorio, nome)}>
              <Download size={17} aria-hidden="true" /> Baixar CSV de custos e DRE
            </button>
          </div>
        </div>
        <div className="report-metrics">
          <div>
            <Building2 size={19} aria-hidden="true" />
            <span>Fixos cadastrados</span>
            <strong>{valor(atual.fixos)}</strong>
            <small>{atual.setoresComFixos} de {atual.setoresTotal} {atual.setoresTotal === 1 ? "setor com registro" : "setores com registro"}</small>
          </div>
          <div>
            <ReceiptText size={19} aria-hidden="true" />
            <span>Compras registradas</span>
            <strong>{valor(atual.compras)}</strong>
            <small>{atual.quantidadeCompras} {atual.quantidadeCompras === 1 ? "documento registrado" : "documentos registrados"}</small>
          </div>
          <div>
            <Wallet size={19} aria-hidden="true" />
            <span>Resultado operacional</span>
            <strong className={atual.resultado !== null && atual.resultado < 0 ? "is-loss" : undefined}>{valor(atual.resultado)}</strong>
            <small>{atual.setoresFechados} de {atual.setoresTotal} {atual.setoresTotal === 1 ? "setor fechado no DRE" : "setores fechados no DRE"}</small>
          </div>
        </div>
      </section>
      {atual.resultado === null && (
        <div className="notice warning report-notice">
          <CircleAlert size={18} aria-hidden="true" />
          <span>O resultado operacional depende do preenchimento do DRE e dos custos realizados de cada setor.</span>
          <button type="button" className="text-button" onClick={() => {
            if (setor !== restaurante.id) selecionar(setor, mes);
            ir("dre");
          }}>Abrir DRE</button>
        </div>
      )}
      {atual.aluguelSemRateio > 0 && (
        <p className="notice warning">{dinheiro(atual.aluguelSemRateio)} de aluguel aguardam distribuição entre os setores.</p>
      )}
      {atual.aluguelProvisorio && (
        <p className="notice warning">Os fixos incluem o rateio provisório do aluguel enquanto falta faturamento realizado por operação.</p>
      )}
      <Evolucao serie={relatorio.serie} atual={mes} />
      <div className="report-breakdowns">
        <Panel title="Fixos por categoria" subtitle="Despesas operacionais cadastradas no mês, com aluguel rateado.">
          <Ranking itens={relatorio.categorias} vazio="Sem despesas fixas cadastradas para esta seleção." />
        </Panel>
        <Panel title="Compras por fornecedor" subtitle="Totais dos documentos registrados na competência.">
          <Ranking itens={relatorio.fornecedores} vazio="Sem compras registradas para esta seleção." />
        </Panel>
      </div>
      {setor === "a-vila" && relatorio.setores.length > 0 && (
        <Panel title="Comparação por setor" subtitle="Valores da competência selecionada.">
          <div className="report-table-wrap">
            <table className="report-table">
              <thead><tr><th scope="col">Setor</th><th scope="col">Fixos</th><th scope="col">Compras</th><th scope="col">Resultado DRE</th></tr></thead>
              <tbody>
                {relatorio.setores.map((linha) => (
                  <tr key={linha.id}>
                    <th scope="row"><button type="button" className="text-button" onClick={() => selecionar(linha.id)}>{linha.nome}</button></th>
                    <td>{valor(linha.fixos)}</td><td>{valor(linha.compras)}</td><td>{valor(linha.resultado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      <RelatorioInsumos setor={setor} mes={mes} />
      <p className="report-source">Compras vêm dos documentos lançados. O CMV vem do fechamento de cada setor. Os custos fixos cadastrados podem incluir estimativas. O traço indica ausência de registro.</p>
    </div>
  );
}
