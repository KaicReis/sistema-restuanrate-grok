"use client";

import { useState } from "react";
import { dinheiro } from "@/lib/dna";
import { operacoes } from "@/lib/v2";
import { totalizarVendasAnotai } from "@/lib/vendas-anotai";
import { useSistema } from "./context";
import { Panel } from "./ui";
import "./vendas-estimadas-setor.css";

const mesLongo = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const numero = new Intl.NumberFormat("pt-BR");
const diaMes = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const nomeMes = (mes: string) => mesLongo.format(new Date(`${mes}-01T12:00:00Z`));

export function VendasEstimadasSetor({ setor }: { setor: string }) {
  const { db, mes } = useSistema();
  const [mesEscolhido, setMesEscolhido] = useState("");
  const historico = [...(db.vendasSetoresEstimadas ?? [])].sort(
    (a, b) => b.competencia.localeCompare(a.competencia),
  );
  const registro = historico.find((item) => item.competencia === (mesEscolhido || mes)) ?? historico[0];
  const grupo = setor === "a-vila";
  const operacoesVisiveis = operacoes(db).filter((item) => grupo || item.id === setor);
  const linhas = operacoesVisiveis.map((item) => ({
    ...item,
    dados: registro?.setores.find((estimativa) => estimativa.restaurante_id === item.id),
  }));
  const total = linhas.reduce((soma, { dados }) => soma + (dados?.valor ?? 0), 0);
  const unidades = linhas.reduce((soma, { dados }) => soma + (dados?.unidades ?? 0), 0);
  const temEstimativa = linhas.some(({ dados }) => dados !== undefined);
  const maior = Math.max(1, ...linhas.map(({ dados }) => dados?.valor ?? 0));
  const vendas = grupo && registro?.periodoAte ? db.vendasAnotai?.find(
    (venda) => venda.competencia === registro.competencia && venda.periodoAte === registro.periodoAte,
  ) : undefined;
  const realizado = vendas ? totalizarVendasAnotai(vendas).subtotal : undefined;
  const diferenca = realizado === undefined ? undefined : total - realizado;

  return (
    <div className="estimativa-panel">
      <Panel
        title="Estimativa por setor"
        subtitle="Quantidades dos relatórios de itens do Anotaí × preços de referência do cardápio"
        action={registro && (
          <label className="estimativa-competencia">
            <span>Mês da estimativa</span>
            <select value={registro.competencia} onChange={(e) => setMesEscolhido(e.target.value)}>
              {historico.map(({ competencia, relatorioParcial }) => (
                <option key={competencia} value={competencia}>{nomeMes(competencia)}{relatorioParcial ? " · Parcial" : ""}</option>
              ))}
            </select>
          </label>
        )}
      >
        {registro ? (
          <>
            {!mesEscolhido && registro.competencia !== mes && (
              <p className="estimativa-cobertura">A competência selecionada não tem estimativa. Exibindo {nomeMes(registro.competencia)}.</p>
            )}
            {registro.relatorioParcial && (
              <p className="estimativa-parcial"><strong>{registro.periodoAte
                ? `Itens até ${diaMes.format(new Date(`${registro.periodoAte}T12:00:00Z`))}`
                : "Relatório parcial de itens"}</strong></p>
            )}
            {realizado !== undefined && diferenca !== undefined && (
              <div className="estimativa-realizado">
                <div>
                  <span>Faturamento realizado da Vila no Anotaí</span>
                  <strong>{dinheiro(realizado)}</strong>
                </div>
                <p>{diferenca === 0
                  ? "A estimativa coincide com o total dos pedidos neste período."
                  : `Os preços de referência geram uma estimativa ${dinheiro(Math.abs(diferenca))} ${diferenca > 0 ? "acima" : "abaixo"} do total dos pedidos.`}</p>
              </div>
            )}
            <div className="estimativa-resumo" aria-live="polite">
              <div>
                <span>{grupo ? "Soma dos setores a preços de referência" : "Valor a preços de referência"}</span>
                <strong>{temEstimativa ? dinheiro(total) : "—"}</strong>
              </div>
              {grupo ? (
                <p><strong>{numero.format(unidades)} de {numero.format(registro.unidadesNoArquivo - (registro.unidadesExcluidas ?? 0))}</strong> unidades consideradas com valor estimado.</p>
              ) : (
                <p>{temEstimativa ? `${numero.format(unidades)} unidades com valor estimado.` : "Sem estimativa para este setor no mês."}</p>
              )}
            </div>
            <dl className="estimativa-setores">
              {linhas.map(({ id, nome, dados }) => (
                <div key={id}>
                  <dt>{id === "bar" ? `${nome} (inclui vinhos)` : nome}</dt>
                  <dd>{dados ? dinheiro(dados.valor) : "—"}</dd>
                  <dd className="estimativa-barra" aria-hidden="true">
                    <span style={{ width: `${(dados?.valor ?? 0) / maior * 100}%` }} />
                  </dd>
                  <dd className="estimativa-unidades">{dados ? `${numero.format(dados.unidades)} un. incluídas` : "Sem estimativa"}</dd>
                </div>
              ))}
            </dl>
            <p className="estimativa-cobertura">O Anotaí informa o valor final por pedido. O arquivo por produto informa quantidades, sem o valor cobrado por item. Para yakissobas e risotos agrupados, os sabores do relatório de adicionais ponderam o preço. Itens sem preço de referência ficam fora da estimativa.</p>
          </>
        ) : (
          <p className="report-empty">Nenhuma competência com estimativa por setor está disponível.</p>
        )}
      </Panel>
    </div>
  );
}
