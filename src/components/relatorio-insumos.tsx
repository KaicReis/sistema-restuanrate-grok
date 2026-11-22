"use client";

import { useState } from "react";
import { percentual } from "@/lib/dna";
import { insumoArquivado } from "@/lib/insumos";
import { historicoInsumo } from "@/lib/relatorio-insumos";
import { operacoes } from "@/lib/v2";
import { useSistema } from "./context";
import { Field, Panel } from "./ui";

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const competencia = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const rotuloMes = (mes: string) => competencia.format(new Date(`${mes}-01T12:00:00Z`));
const preco = ({ valor, unidade }: { valor: number; unidade: string }) =>
  `${moeda.format(valor / 100)} / ${unidade}`;

export function RelatorioInsumos({ setor, mes }: { setor: string; mes: string }) {
  const { db } = useSistema();
  const [id, setId] = useState("");
  const nomes = new Map(operacoes(db).map(({ id, nome }) => [id, nome]));
  const insumos = db.insumos.filter((insumo) =>
    nomes.has(insumo.restaurante_id) &&
    (setor === "a-vila" || insumo.restaurante_id === setor) && !insumoArquivado(insumo),
  ).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const selecionado = insumos.find((insumo) => insumo.id === id)
    ?? insumos.find((insumo) => historicoInsumo(insumo, mes).historico.length > 0)
    ?? insumos[0];
  const dados = selecionado ? historicoInsumo(selecionado, mes) : null;
  const pontos = dados?.historico.filter((item) => item.unidade === dados.atual?.unidade).slice(0, 6).reverse() ?? [];
  const maior = Math.max(1, ...pontos.map(({ valor }) => valor));

  return (
    <Panel title="Histórico de preços dos insumos"
      subtitle="Compare preços de compra por quilo, litro ou unidade.">
      {selecionado && dados ? (
        <>
          <div style={{ maxWidth: "32rem" }}>
            <Field label="Insumo">
              <select value={selecionado.id} onChange={(e) => setId(e.target.value)}>
                {insumos.map((insumo) => (
                  <option key={insumo.id} value={insumo.id}>
                    {insumo.nome}{setor === "a-vila" ? ` · ${nomes.get(insumo.restaurante_id) ?? insumo.restaurante_id}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {dados.atual ? (
            <>
              <p style={{ marginBlock: "0.75rem 0.25rem" }}>
                <strong>{preco(dados.atual)}</strong> <span className="muted">em {rotuloMes(dados.atual.competencia)}</span>
              </p>
              {dados.variacao !== null && dados.anterior && (
                <p className="muted" style={{ marginBlock: "0 0.85rem" }}>
                  {dados.variacao > 0 ? "Alta de " : dados.variacao < 0 ? "Queda de " : "Sem variação"}
                  {dados.variacao !== 0 && percentual(Math.abs(dados.variacao))}
                  {" em relação a "}{rotuloMes(dados.anterior.competencia)}.
                </p>
              )}
              {pontos.length > 1 && (
                <div aria-hidden="true" style={{ display: "grid", gap: "0.5rem", marginBlock: "0.9rem" }}>
                  {pontos.map((item) => (
                    <div key={item.competencia} style={{ display: "grid", gridTemplateColumns: "7.25rem minmax(0, 1fr)", alignItems: "center", gap: "0.5rem" }}>
                      <span className="muted">{rotuloMes(item.competencia)}</span>
                      <div style={{ height: "0.55rem", background: "#dce5db", borderRadius: "1rem", overflow: "hidden" }}>
                        <div style={{ width: `${item.valor / maior * 100}%`, height: "100%", background: "var(--green)", borderRadius: "inherit" }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <details>
                <summary>Consultar preços por mês</summary>
                <div style={{ overflowX: "auto" }}>
                  <table aria-label="Preços de compra por competência" style={{ width: "100%", borderSpacing: "0 0.3rem" }}>
                    <thead>
                      <tr>
                        <th scope="col" style={{ textAlign: "start" }}>Competência</th>
                        <th scope="col" style={{ textAlign: "end" }}>Preço de compra</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dados.historico.map((item) => (
                        <tr key={item.competencia}>
                          <th scope="row" style={{ textAlign: "start", fontWeight: 400 }}>{rotuloMes(item.competencia)}</th>
                          <td style={{ textAlign: "end" }}>{preco(item)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          ) : (
            <p className="muted" style={{ marginBlock: "0.75rem" }}>
              {dados.referencia
                ? `Referência sem data de compra · ${preco(dados.referencia)}.`
                : "Nenhum preço confirmado até a competência selecionada."}
            </p>
          )}
          <p className="muted" style={{ marginBlock: "0.85rem 0" }}>
            O histórico inclui preços cadastrados diretamente nos insumos. Consulte Compras para ver os gastos registrados.
          </p>
        </>
      ) : <p className="muted">Nenhum insumo ativo nesta seleção.</p>}
    </Panel>
  );
}
