"use client";

import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { dinheiro } from "@/lib/dna";
import { coberturaSalaoAnotai, inicioSalaoAnotai, pedidosRealizadosNoCanal, ticketMedioAnotai } from "@/lib/vendas-anotai";
import type { CanalVenda } from "@/lib/vendas-setor-canal";
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
  const { db, mes } = useSistema();
  const [mesEscolhido, setMesEscolhido] = useState("");
  const competencia = mesEscolhido || mes;
  const [canal, setCanal] = useState<CanalVenda | "todos">("todos");
  const historico = db.vendasSetorCanal ?? [];
  const vendasAnotai = db.vendasAnotai ?? [];
  const competencias = [...new Set([
    mes,
    ...historico.map((registro) => registro.competencia),
    ...vendasAnotai.map((venda) => venda.competencia),
  ])].sort().reverse();
  const registro = historico.find((item) => item.competencia === competencia);
  const venda = vendasAnotai.find((item) => item.competencia === competencia);
  const coberturaSalao = venda && coberturaSalaoAnotai(venda, inicioSalaoAnotai(vendasAnotai));
  const grupo = setor === "a-vila";
  const setores = operacoes(db).filter((item) => grupo || item.id === setor);
  const canaisVisiveis = canais.filter(({ id }) => canal === "todos" || id === canal);
  const comTotal = canaisVisiveis.length > 1;
  const linhas = setores.map(({ id, nome }) => {
    const selecionadas = registro?.linhas.filter((item) => item.restaurante_id === id &&
      canaisVisiveis.some(({ id: canalId }) => item.canal === canalId) &&
      (item.canal !== "salao" || (coberturaSalao && coberturaSalao !== "ausente"))) ?? [];
    const subtotal = selecionadas.reduce((total, item) => total + item.subtotal, 0);
    const quantidade = selecionadas.reduce((total, item) => total + (item.pedidos ?? 0), 0);
    const ticket = selecionadas.some((item) => item.pedidos === undefined)
      ? null : ticketMedioAnotai(subtotal, quantidade);
    const valores = canaisVisiveis.map(({ id: canalId }) => {
      if (canalId === "salao" && (!coberturaSalao || coberturaSalao === "ausente")) return null;
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
      <Panel
        title="Faturamento real por setor e canal"
        subtitle="Subtotais dos pedidos contabilizados no Anotaí, sem frete."
        action={
          <div className="faturamento-matriz-filtros">
            <label>
              <span>Mês do faturamento</span>
              <select value={competencia} onChange={(evento) => setMesEscolhido(evento.target.value)}>
                {competencias.map((item) => <option key={item} value={item}>{nomeMes(item)}</option>)}
              </select>
            </label>
            {registro && (
              <label>
                <span>Canal de venda</span>
                <select value={canal} onChange={(evento) => setCanal(evento.target.value as typeof canal)}>
                  <option value="todos">Todos os canais</option>
                  {canais.map(({ id, nome }) => <option key={id} value={id}>{nome}</option>)}
                </select>
              </label>
            )}
          </div>
        }
      >
        {!registro ? (
          <div className="faturamento-matriz-aviso" role="status">
            <FileSpreadsheet size={19} aria-hidden="true" />
            <div>
              <strong>Detalhamento pendente para {nomeMes(competencia)}</strong>
              <p>Importe o CSV de pedidos do Anotaí e o CSV de itens da mesma competência. O CSV de pedidos informa o canal. O CSV de itens precisa trazer número e data do pedido, setor e valor líquido cobrado após descontos.</p>
              {!venda && <p>Os totais do Anotaí da competência precisam estar disponíveis para conferir a importação.</p>}
              {venda && !grupo && <p>Abra os relatórios da Vila para importar os dois arquivos.</p>}
            </div>
          </div>
        ) : setores.length === 0 ? (
          <p className="report-empty">Nenhuma operação disponível para exibir nesta seleção.</p>
        ) : (
          <>
            {(registro.periodoAte || coberturaSalao === "parcial") && (
              <p className="faturamento-matriz-parcial">
                {registro.periodoAte && `Dados até ${dataLonga.format(new Date(`${registro.periodoAte}T12:00:00Z`))}.`}
                {coberturaSalao === "parcial" && " Cobertura parcial do salão."}
              </p>
            )}
            <div className="report-table-wrap" tabIndex={0} role="region" aria-label="Tabela de faturamento por setor e canal">
              <table className="report-table" aria-label={`Faturamento real de ${nomeMes(competencia)}`}>
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
                      <th scope="row">{nome}</th>
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
        {grupo && venda && (
          <div className="faturamento-matriz-importacao">
            <ImportarVendasSetorCanal key={competencia} competencia={competencia} />
          </div>
        )}
      </Panel>
    </div>
  );
}
