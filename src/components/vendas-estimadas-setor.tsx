"use client";

import { useState } from "react";
import { dinheiro } from "@/lib/dna";
import { operacoes } from "@/lib/v2";
import { useSistema } from "./context";
import { Panel } from "./ui";
import "./vendas-estimadas-setor.css";

const mesLongo = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const numero = new Intl.NumberFormat("pt-BR");
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

  return (
    <div className="estimativa-panel">
      <Panel
        title="Estimativa de vendas por setor"
        subtitle="Quantidades dos relatórios de itens do Anotaí × preços de referência do cardápio"
        action={registro && (
          <label className="estimativa-competencia">
            <span>Mês da estimativa</span>
            <select value={registro.competencia} onChange={(e) => setMesEscolhido(e.target.value)}>
              {historico.map(({ competencia }) => <option key={competencia} value={competencia}>{nomeMes(competencia)}</option>)}
            </select>
          </label>
        )}
      >
        {registro ? (
          <>
            {!mesEscolhido && registro.competencia !== mes && (
              <p className="estimativa-cobertura">A competência selecionada não tem estimativa. Exibindo {nomeMes(registro.competencia)}.</p>
            )}
            <div className="estimativa-resumo" aria-live="polite">
              <div>
                <span>{grupo ? "Total estimado dos setores" : "Total estimado do setor"}</span>
                <strong>{temEstimativa ? dinheiro(total) : "—"}</strong>
              </div>
              {grupo ? (
                <p><strong>{numero.format(unidades)} de {numero.format(registro.unidadesNoArquivo)}</strong> unidades do arquivo com valor estimado.</p>
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
            <p className="estimativa-cobertura">Usamos preços de referência do salão e do delivery. Para yakissobas e risotos agrupados, usamos a média ponderada pelos sabores do relatório de adicionais de cada mês. As quantidades vêm do relatório de itens principais. Itens sem correspondência ficam fora da conta.</p>
          </>
        ) : (
          <p className="report-empty">Nenhuma competência com estimativa por setor está disponível.</p>
        )}
      </Panel>
    </div>
  );
}
