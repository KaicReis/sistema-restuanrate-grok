"use client";

import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { dinheiro } from "@/lib/dna";
import { pedidosRealizadosNoCanal, ticketMedioAnotai } from "@/lib/vendas-anotai";
import type { CanalVenda } from "@/lib/vendas-setor-canal";
import { resumoVendas, selecionarLinhasVendas } from "@/lib/resumo-vendas";
import { operacoes } from "@/lib/v2";
import { useSistema } from "./context";
import { ImportarVendasSetorCanal } from "./importar-vendas-setor-canal";
import { Panel } from "./ui";
import "./faturamento-matriz.css";

const canais: { id: CanalVenda; nome: string }[] = [
  { id: "salao", nome: "Salão" },
  { id: "delivery", nome: "Delivery" },
  { id: "retirada", nome: "Retirada" },
];
const mesLongo = new Intl.DateTimeFormat("pt-BR", {
  month: "long", year: "numeric", timeZone: "UTC",
});
const dataLonga = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC",
});

function nomeMes(competencia: string) {
  return mesLongo.format(new Date(`${competencia}-01T12:00:00Z`));
}

export function FaturamentoMatriz({ setor }: { setor: string }) {
  const { db, mes, selecionar } = useSistema();
  const [canal, setCanal] = useState<CanalVenda | "todos">("todos");
  const { registro, venda, coberturaSalao, periodoAte, parcial, total: totalApurado } = resumoVendas(db, mes, setor);
  const grupo = setor === "a-vila";
  const setores = operacoes(db).filter((item) => grupo || item.id === setor);
  const canaisVisiveis = canais.filter(({ id }) => canal === "todos" || id === canal);
  const comTotal = canaisVisiveis.length > 1;
  const linhas = setores.map(({ id, nome }) => {
    const selecionadas = registro
      ? selecionarLinhasVendas(registro, id, canaisVisiveis.map(({ id: canalId }) => canalId), coberturaSalao)
      : [];
    const subtotal = selecionadas.reduce((total, item) => total + item.subtotal, 0);
    const quantidade = selecionadas.reduce((total, item) => total + (item.pedidos ?? 0), 0);
    const ticket = selecionadas.some((item) => item.pedidos === undefined)
      ? null : ticketMedioAnotai(subtotal, quantidade);
    const valores = canaisVisiveis.map(({ id: canalId }) => {
      if (canalId === "salao" && (coberturaSalao === "ausente")) return null;
      return selecionadas.find((item) => item.canal === canalId)?.subtotal ?? 0;
    });
    return { id, nome, valores, subtotal, ticket };
  });
  const totais = canaisVisiveis.map((_, indice) => {
    const valores = linhas.flatMap(({ valores }) => valores[indice] === null ? [] : [valores[indice]]);
    return valores.length ? valores.reduce((total, valor) => total + valor, 0) : null;
  });
  const total = totais.reduce<number>((soma, valor) => soma + (valor ?? 0), 0);

  const pedidosDaVila = venda ? canaisVisiveis.reduce((soma, { id }, i) =>
    soma + (totais[i] === null ? 0 : pedidosRealizadosNoCanal(venda, id).pedidos), 0) : 0;
  const ticketDaVila = ticketMedioAnotai(total, pedidosDaVila);

  return (
    <div className="faturamento-matriz">
      <section className="sales-hero panel" aria-labelledby="vendas-realizadas-titulo">
        <div className="sales-hero-content">
          <p className="sales-kicker">Vendas realizadas · Anotaí</p>
          <h2 id="vendas-realizadas-titulo">{db.restaurantes.find(({ id }) => id === setor)?.nome} · {nomeMes(mes)}</h2>
          <strong className={totalApurado === null ? "sales-missing" : "sales-amount"}>
            {totalApurado === null ? "Sem dados para este período" : dinheiro(totalApurado)}
          </strong>
          <p>{totalApurado === null ? "Nenhum valor realizado foi apurado para esta seleção." : "Valores dos pedidos contabilizados, sem frete."}</p>
          {totalApurado !== null && parcial && (
            <p className="sales-coverage">
              <strong>Dados parciais.</strong>{periodoAte && ` Dados até ${dataLonga.format(new Date(`${periodoAte}T12:00:00Z`))}.`}
              {coberturaSalao === "ausente" && " Sem cobertura do salão."}
              {coberturaSalao === "parcial" && " Cobertura parcial do salão."}
            </p>
          )}
        </div>
        {!registro && (
          <div className="sales-hero-action">
            <button type="button" className="button" onClick={() => {
              const aviso = document.getElementById("vendas-detalhamento");
              aviso?.focus({ preventScroll: true });
              aviso?.scrollIntoView({ block: "nearest" });
            }}>Ver o que falta</button>
            {venda && <ImportarVendasSetorCanal key={mes} competencia={mes} />}
          </div>
        )}
      </section>
      <Panel
        title={grupo ? "Vendas por setor e canal" : "Vendas por canal"}
        subtitle="Pedidos contabilizados no Anotaí, sem frete."
        action={registro && (
          <div className="faturamento-matriz-filtros">
              <label>
                <span>Canal de venda</span>
                <select value={canal} onChange={(evento) => setCanal(evento.target.value as typeof canal)}>
                  <option value="todos">Todos os canais</option>
                  {canais.map(({ id, nome }) => <option key={id} value={id}>{nome}</option>)}
                </select>
              </label>
          </div>
        )}
      >
        {!registro ? (
          <div className="faturamento-matriz-aviso" id="vendas-detalhamento" tabIndex={-1} role="status">
            <FileSpreadsheet size={19} aria-hidden="true" />
            <div>
              <strong>Detalhamento pendente para {nomeMes(mes)}</strong>
              {!venda && <p>Primeiro, os totais de pedidos deste mês precisam estar disponíveis na gestão para conferir os arquivos do Anotaí.</p>}
              <p>Para separar as vendas, são necessários dois CSVs do mesmo mês: pedidos com canal de venda e itens com número e data do pedido, setor e valor cobrado após descontos.</p>
              {grupo && setores.length > 0 && (
                <ul className="sales-sector-missing">
                  {setores.map(({ id, nome }) => (
                    <li key={id}><button type="button" className="text-button" onClick={() => selecionar(id)}>{nome}</button><span>Sem detalhamento</span></li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : setores.length === 0 ? (
          <p className="report-empty">Nenhuma operação disponível para exibir nesta seleção.</p>
        ) : (
          <>
            <div className="report-table-wrap" tabIndex={0} role="region" aria-label="Tabela de faturamento por setor e canal">
              <table className="report-table" aria-label={`Faturamento real de ${nomeMes(mes)}`}>
                <thead>
                  <tr>
                    <th scope="col">Setor</th>
                    {canaisVisiveis.map(({ id, nome }) => <th scope="col" key={id}>{nome}</th>)}
                    {comTotal && <th scope="col">Total apurado</th>}
                    <th scope="col">Ticket médio</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map(({ id, nome, valores, subtotal, ticket }) => (
                    <tr key={id}>
                      <th scope="row">{grupo ? <button type="button" className="text-button" onClick={() => selecionar(id)}>{nome}</button> : nome}</th>
                      {valores.map((valor, indice) => (
                        <td key={canaisVisiveis[indice].id}>{valor === null ? "Sem cobertura" : dinheiro(valor)}</td>
                      ))}
                      {comTotal && (
                        <td className="faturamento-matriz-total">
                          {dinheiro(subtotal)}
                        </td>
                      )}
                      <td>{ticket === null ? "—" : dinheiro(ticket)}</td>
                    </tr>
                  ))}
                </tbody>
                {grupo && (
                  <tfoot>
                    <tr>
                      <th scope="row">Total da Vila</th>
                      {totais.map((valor, indice) => (
                        <td key={canaisVisiveis[indice].id}>{valor === null ? "Sem cobertura" : dinheiro(valor)}</td>
                      ))}
                      {comTotal && <td>{dinheiro(total)}</td>}
                      <td>{ticketDaVila === null ? "—" : dinheiro(ticketDaVila)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <p className="faturamento-matriz-cobertura">Valores cobrados nos itens de pedidos contabilizados, após descontos. O ticket médio do setor divide o subtotal pelo número de pedidos que contêm itens do setor, nos canais selecionados.</p>
            {registro.linhas.some((item) => item.pedidos === undefined) && <p className="faturamento-matriz-cobertura">Reimporte os arquivos deste mês para calcular o ticket médio por setor.</p>}
          </>
        )}
        {grupo && venda && registro && (
          <div className="faturamento-matriz-importacao">
            <ImportarVendasSetorCanal key={mes} competencia={mes} />
          </div>
        )}
      </Panel>
    </div>
  );
}
