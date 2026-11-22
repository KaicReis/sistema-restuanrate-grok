"use client";

import { useState } from "react";
import { ChartColumnIncreasing, ShoppingBag } from "lucide-react";
import { dinheiro } from "@/lib/dna";
import type { VendaAnotaiMensal } from "@/lib/vendas-anotai";
import { useSistema } from "./context";
import "./vendas-anotai.css";

const canais = [
  { id: "delivery", nome: "Delivery" },
  { id: "retirada", nome: "Retirada" },
  { id: "salao", nome: "Salão" },
] as const;
type Canal = (typeof canais)[number]["id"];
type Filtro = Canal | "todos";
const formatos = {
  mes: new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }),
  curto: new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }),
  dia: new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
  numero: new Intl.NumberFormat("pt-BR"),
};
const dataMes = (mes: string) => new Date(`${mes}-01T12:00:00Z`);
const pedidos = (n: number) => `${formatos.numero.format(n)} ${n === 1 ? "pedido" : "pedidos"}`;

function totalizar(venda: VendaAnotaiMensal) {
  return canais.reduce((soma, { id }) => ({
    subtotal: soma.subtotal + venda.canais[id].subtotal,
    pedidos: soma.pedidos + venda.canais[id].pedidos,
  }), { subtotal: 0, pedidos: 0 });
}

function estaCoberto(canal: Filtro, mes: string, inicioSalao?: string) {
  return canal !== "salao" || !inicioSalao || mes >= inicioSalao.slice(0, 7);
}

function dadosCanal(venda: VendaAnotaiMensal, canal: Filtro) {
  return canal === "todos" ? totalizar(venda) : venda.canais[canal];
}

function Modalidades({ venda, inicioSalao }: { venda: VendaAnotaiMensal; inicioSalao?: string }) {
  return (
    <dl className="anotai-canais">
      {canais.map(({ id, nome }) => {
        const dados = venda.canais[id];
        const coberto = estaCoberto(id, venda.competencia, inicioSalao);
        return (
          <div key={id}>
            <dt>{nome}</dt>
            <dd><strong>{coberto ? dinheiro(dados.subtotal) : "—"}</strong></dd>
            <dd>{coberto ? pedidos(dados.pedidos) : "Sem cobertura"}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function EvolucaoAnotai({ vendas, mes, inicioSalao }: {
  vendas: VendaAnotaiMensal[];
  mes: string;
  inicioSalao?: string;
}) {
  const anos = [...new Set(vendas.map(({ competencia }) => competencia.slice(0, 4)))].sort().reverse();
  const [ano, setAno] = useState(anos.includes(mes.slice(0, 4)) ? mes.slice(0, 4) : anos[0]);
  const [canal, setCanal] = useState<Filtro>("todos");
  const [foco, setFoco] = useState(mes);
  const serie = vendas.filter((venda) => venda.competencia.startsWith(ano + "-"));
  const ativo = serie.find((venda) => venda.competencia === foco) ?? serie.at(-1);
  const max = Math.max(1, ...serie.map((venda) =>
    estaCoberto(canal, venda.competencia, inicioSalao) ? dadosCanal(venda, canal).subtotal : 0,
  ));
  const modos = [{ id: "todos", nome: "Total" }, ...canais] as const;
  const totalAno = serie.reduce((soma, venda) => {
    const dados = totalizar(venda);
    return { subtotal: soma.subtotal + dados.subtotal, pedidos: soma.pedidos + dados.pedidos };
  }, { subtotal: 0, pedidos: 0 });

  return (
    <div className="anotai-evolucao">
      <div className="anotai-evolucao-head">
        <div>
          <h3>Evolução das vendas</h3>
          <p className="anotai-total-ano">{dinheiro(totalAno.subtotal)} em {pedidos(totalAno.pedidos)} nos meses importados de {ano}.</p>
        </div>
        {anos.length > 1 && (
          <label>
            <span>Ano das vendas</span>
            <select value={ano} onChange={(event) => setAno(event.target.value)}>
              {anos.map((opcao) => <option key={opcao}>{opcao}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="anotai-filtros" role="group" aria-label="Modalidade no gráfico de vendas">
        {modos.map(({ id, nome }) => (
          <button type="button" className="button" key={id} aria-pressed={canal === id} onClick={() => setCanal(id)}>{nome}</button>
        ))}
      </div>
      <ol className="anotai-grafico" aria-label="Vendas por mês, sem frete">
        {serie.map((venda) => {
          const { competencia } = venda;
          const coberto = estaCoberto(canal, competencia, inicioSalao);
          const { subtotal, pedidos: quantidade } = dadosCanal(venda, canal);
          return (
            <li key={competencia}>
              <button
                type="button"
                aria-pressed={ativo?.competencia === competencia}
                aria-label={`${formatos.mes.format(dataMes(competencia))}, ${coberto ? `${dinheiro(subtotal)}, ${pedidos(quantidade)}` : "salão sem cobertura"}`}
                onClick={() => setFoco(competencia)}
              >
                <span>{formatos.curto.format(dataMes(competencia))}</span>
                <span className="anotai-barra" aria-hidden="true">
                  <span style={{ width: `${coberto ? Math.max(0, subtotal) / max * 100 : 0}%` }} />
                </span>
                <strong>{coberto ? dinheiro(subtotal) : "—"}</strong>
              </button>
            </li>
          );
        })}
      </ol>
      {ativo && (
        <section className="anotai-detalhe" aria-label="Detalhes da competência" aria-live="polite">
          <h4>{formatos.mes.format(dataMes(ativo.competencia))}</h4>
          <Modalidades venda={ativo} inicioSalao={inicioSalao} />
        </section>
      )}
      <details className="anotai-tabela">
        <summary>Ver tabela de vendas do ano</summary>
        <div>
          <table>
            <thead>
              <tr><th scope="col">Mês</th>{canais.map(({ id, nome }) => <th scope="col" key={id}>{nome}</th>)}<th scope="col">Total sem frete</th><th scope="col">Pedidos</th></tr>
            </thead>
            <tbody>
              {serie.map((venda) => {
                const total = totalizar(venda);
                return (
                  <tr key={venda.competencia}>
                    <th scope="row">{formatos.mes.format(dataMes(venda.competencia))}</th>
                    {canais.map(({ id }) => (
                      <td key={id}>{estaCoberto(id, venda.competencia, inicioSalao) ? dinheiro(venda.canais[id].subtotal) : "—"}</td>
                    ))}
                    <td>{dinheiro(total.subtotal)}</td><td>{formatos.numero.format(total.pedidos)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export function VendasAnotai({ detalhado = false }: { detalhado?: boolean }) {
  const { db, mes, selecionar, ir } = useSistema();
  const vendas = [...(db.vendasAnotai ?? [])].sort((a, b) => a.competencia.localeCompare(b.competencia));
  const atual = vendas.find((venda) => venda.competencia === mes);
  const ultima = vendas.at(-1);
  const referencia = atual ?? ultima;
  const total = referencia ? totalizar(referencia) : null;
  const inicioSalao = vendas.flatMap(({ salaoDesde }) => salaoDesde && /^\d{4}-\d{2}-\d{2}$/.test(salaoDesde) ? [salaoDesde] : []).sort()[0];

  return (
    <section className="anotai-panel panel" aria-labelledby="anotai-titulo">
      <div className="anotai-head">
        <div>
          <h2 id="anotai-titulo"><ShoppingBag size={21} aria-hidden="true" /> Vendas da Vila</h2>
          <p>Anotaí · Pedidos finalizados · Sem frete</p>
        </div>
        {!detalhado && ultima && (
          <button type="button" className="button" onClick={() => ir("relatorios")}>
            <ChartColumnIncreasing size={16} aria-hidden="true" /> Ver evolução
          </button>
        )}
      </div>
      {!atual && (
        <div className="anotai-sem-competencia">
          <p>Sem vendas importadas para {formatos.mes.format(dataMes(mes))}.</p>
          {ultima && (
            <button type="button" className="button" onClick={() => selecionar("a-vila", ultima.competencia)}>
              Abrir {formatos.mes.format(dataMes(ultima.competencia))}
            </button>
          )}
        </div>
      )}
      {referencia && total && (
        <div className="anotai-mensal">
          <div className="anotai-total">
            <span>{atual ? "" : "Último mês importado · "}{formatos.mes.format(dataMes(referencia.competencia))}</span>
            <strong>{dinheiro(total.subtotal)}</strong>
            <small>{pedidos(total.pedidos)} finalizados</small>
          </div>
          <Modalidades venda={referencia} inicioSalao={inicioSalao} />
        </div>
      )}
      {detalhado && vendas.length > 0 && <EvolucaoAnotai vendas={vendas} mes={mes} inicioSalao={inicioSalao} />}
      {inicioSalao && (
        <p className="anotai-cobertura">O salão consta no Anotaí desde {formatos.dia.format(new Date(`${inicioSalao}T12:00:00Z`))}. O primeiro mês do salão tem cobertura parcial.</p>
      )}
    </section>
  );
}
