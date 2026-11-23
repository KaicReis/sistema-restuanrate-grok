"use client";

import { useState } from "react";
import { ChartColumnIncreasing, Check, ShoppingBag } from "lucide-react";
import { dinheiro } from "@/lib/dna";
import {
  faturamentoAnotai,
  faturamentoConsolidadoNoMes,
  coberturaSalaoAnotai,
  conferirPainelAnotai,
  pedidosRealizadosNoCanal,
  ticketMedioAnotai,
  inicioSalaoAnotai,
  totalizarVendasAnotai as totalizar,
  type VendaAnotaiMensal,
} from "@/lib/vendas-anotai";
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
  diaMes: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }),
  dia: new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
  numero: new Intl.NumberFormat("pt-BR"),
};
const dataMes = (mes: string) => new Date(`${mes}-01T12:00:00Z`);
const pedidos = (n: number) => `${formatos.numero.format(n)} ${n === 1 ? "pedido" : "pedidos"}`;

function rotuloParcial(periodoAte: string) {
  return `Parcial até ${formatos.diaMes.format(new Date(`${periodoAte}T12:00:00Z`))}`;
}

function estaCoberto(canal: Filtro, venda: VendaAnotaiMensal, inicioSalao?: string) {
  return canal !== "salao" || coberturaSalaoAnotai(venda, inicioSalao) !== "ausente";
}

function dadosCanal(venda: VendaAnotaiMensal, canal: Filtro) {
  return canal === "todos" ? totalizar(venda) : pedidosRealizadosNoCanal(venda, canal);
}

function Modalidades({ venda, inicioSalao }: { venda: VendaAnotaiMensal; inicioSalao?: string }) {
  return (
    <dl className="anotai-canais">
      {canais.map(({ id, nome }) => {
        const dados = pedidosRealizadosNoCanal(venda, id);
        const coberto = estaCoberto(id, venda, inicioSalao);
        const ticket = ticketMedioAnotai(dados.subtotal, dados.pedidos);
        return (
          <div key={id}>
            <dt>{nome}</dt>
            <dd><strong>{coberto ? dinheiro(dados.subtotal) : "—"}</strong></dd>
            <dd>{coberto ? pedidos(dados.pedidos) : "Sem cobertura"}</dd>
            {coberto && ticket !== null && <dd>Ticket médio {dinheiro(ticket)}</dd>}
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
  const ano = mes.slice(0, 4);
  const [canal, setCanal] = useState<Filtro>("todos");
  const [foco, setFoco] = useState(mes);
  const serie = vendas.filter((venda) => venda.competencia.startsWith(ano + "-"));
  const ativo = serie.find((venda) => venda.competencia === foco);
  const max = Math.max(1, ...serie.map((venda) =>
    estaCoberto(canal, venda, inicioSalao) ? dadosCanal(venda, canal).subtotal : 0,
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
          <h3>Histórico de vendas de {ano}</h3>
          <p className="anotai-total-ano">{serie.length ? <>{dinheiro(totalAno.subtotal)} em {pedidos(totalAno.pedidos)} nos períodos importados de {ano}.{serie.some(({ periodoAte }) => periodoAte) && " A soma inclui meses parciais."}</> : "Nenhum mês importado neste ano."}</p>
        </div>
      </div>
      <div className="anotai-filtros" role="group" aria-label="Modalidade no gráfico de vendas">
        {modos.map(({ id, nome }) => (
          <button type="button" className="button" key={id} aria-pressed={canal === id} onClick={() => setCanal(id)}>{nome}</button>
        ))}
      </div>
      <ol className="anotai-grafico" aria-label="Vendas por mês, sem frete">
        {serie.map((venda) => {
          const { competencia, periodoAte } = venda;
          const parcial = periodoAte ? rotuloParcial(periodoAte) : null;
          const coberto = estaCoberto(canal, venda, inicioSalao);
          const { subtotal, pedidos: quantidade } = dadosCanal(venda, canal);
          return (
            <li key={competencia}>
              <button
                type="button"
                aria-pressed={ativo?.competencia === competencia}
                aria-label={`${formatos.mes.format(dataMes(competencia))}, ${coberto ? `${dinheiro(subtotal)}, ${pedidos(quantidade)}` : "salão sem cobertura"}${parcial ? `, ${parcial}` : ""}`}
                onClick={() => setFoco(competencia)}
              >
                <span>{formatos.curto.format(dataMes(competencia))}</span>
                <span className={`anotai-barra${parcial ? " anotai-barra-parcial" : ""}`} aria-hidden="true">
                  <span style={{ width: `${coberto ? Math.max(0, subtotal) / max * 100 : 0}%` }} />
                </span>
                <strong>
                  {coberto ? dinheiro(subtotal) : "—"}
                  {parcial && <small className="anotai-indicacao-parcial">{parcial}</small>}
                </strong>
              </button>
            </li>
          );
        })}
      </ol>
      {ativo && (
        <section className="anotai-detalhe" aria-label="Detalhes da competência" aria-live="polite">
          <h4>{formatos.mes.format(dataMes(ativo.competencia))}</h4>
          {ativo.periodoAte && <p className="anotai-cobertura">{rotuloParcial(ativo.periodoAte)}</p>}
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
                    <th scope="row">
                      {formatos.mes.format(dataMes(venda.competencia))}
                      {venda.periodoAte && <small className="anotai-indicacao-parcial">{rotuloParcial(venda.periodoAte)}</small>}
                    </th>
                    {canais.map(({ id }) => (
                      <td key={id}>{estaCoberto(id, venda, inicioSalao) ? dinheiro(pedidosRealizadosNoCanal(venda, id).subtotal) : "—"}</td>
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

function AplicarFaturamento({ venda, inicioSalao }: { venda: VendaAnotaiMensal; inicioSalao?: string }) {
  const { db, atualizar } = useSistema();
  const faturamento = faturamentoAnotai(venda, inicioSalao);
  const aplicado = faturamentoConsolidadoNoMes(db, venda.competencia);
  const registrado = aplicado?.valor === faturamento.valor &&
    aplicado?.periodoAte === faturamento.periodoAte &&
    aplicado?.coberturaSalao === faturamento.coberturaSalao;

  if (registrado) {
    return <span className="anotai-registrado"><Check size={16} aria-hidden="true" /> Faturamento registrado</span>;
  }
  return (
    <button type="button" className="button" onClick={() => atualizar((draft) => {
      const outros = (draft.faturamentosConsolidados ?? []).filter(({ competencia }) => competencia !== venda.competencia);
      draft.faturamentosConsolidados = [...outros, faturamento].sort((a, b) => a.competencia.localeCompare(b.competencia));
    }, "Faturamento realizado do Anotaí registrado.")}>
      {aplicado ? "Atualizar faturamento do mês" : "Usar como faturamento realizado"}
    </button>
  );
}

function ConferenciaAnotai({ venda }: { venda: VendaAnotaiMensal }) {
  const resumo = conferirPainelAnotai(venda);
  if (!resumo) return null;
  const { finalizados, painel, mesmasContagens, diferenca } = resumo;
  const linhas = [
    { nome: "Finalizados", dados: finalizados },
    { nome: "Cancelados", dados: resumo.cancelados },
    { nome: "Expirados", dados: resumo.expirados },
    { nome: "Rejeitados", dados: resumo.rejeitados },
  ];
  return (
    <section className="anotai-conferencia" aria-label="Conferência do total com o Anotaí">
      <h3>Conferência com o painel do Anotaí</h3>
      <dl className="anotai-conferencia-numeros">
        <div><dt>Finalizados sem frete</dt><dd>{dinheiro(finalizados.subtotal)}</dd></div>
        <div><dt>Frete dos finalizados</dt><dd>{dinheiro(finalizados.frete)}</dd></div>
        <div><dt>Finalizados com frete</dt><dd>{dinheiro(finalizados.total)}</dd></div>
        {painel && <div><dt>Total na imagem do Anotaí</dt><dd>{dinheiro(painel.totalVendas)}</dd></div>}
      </dl>
      {painel && (
        <p className="anotai-conferencia-pendencia">
          {mesmasContagens
            ? `As contagens coincidem ao considerar ${formatos.numero.format(resumo.pedidosSemRejeitados)} pedidos e agrupar cancelados e expirados.`
            : "As contagens do painel e do arquivo precisam ser conferidas."}
          {" "}Somar as linhas com frete dá <strong>{dinheiro(resumo.totalSemRejeitados)}</strong>.
          {diferenca !== undefined && diferenca !== 0 && (
            <> A soma fica <strong>{dinheiro(Math.abs(diferenca))} {diferenca > 0 ? "abaixo" : "acima"}</strong> do painel no mesmo período. A fórmula exata desse total está pendente de confirmação.</>
          )}
        </p>
      )}
      <details className="anotai-tabela">
        <summary>Ver contagem e valores por status</summary>
        <div>
          <table>
            <thead>
              <tr><th scope="col">Status no arquivo</th><th scope="col">Linhas</th><th scope="col">Sem frete</th><th scope="col">Frete</th><th scope="col">Com frete</th></tr>
            </thead>
            <tbody>
              {linhas.map(({ nome, dados }) => (
                <tr key={nome}>
                  <th scope="row">{nome}</th><td>{formatos.numero.format(dados.pedidos)}</td>
                  <td>{dinheiro(dados.subtotal)}</td><td>{dinheiro(dados.frete)}</td><td>{dinheiro(dados.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="anotai-cobertura">A Gestão soma a coluna de subtotal dos pedidos finalizados e dos expirados confirmados como pagos. O Anotaí descreve o cartão como total sem considerar descontos ou taxas. Somar os {dinheiro(resumo.descontosInformativosSemRejeitados)} da coluna de descontos informativos ao teste com frete daria {dinheiro(resumo.totalComDescontosRepostos)}.</p>
      </details>
    </section>
  );
}

export function VendasAnotai({ detalhado = false }: { detalhado?: boolean }) {
  const { db, mes, selecionar, ir } = useSistema();
  const vendas = [...(db.vendasAnotai ?? [])].sort((a, b) => a.competencia.localeCompare(b.competencia));
  const atual = vendas.find((venda) => venda.competencia === mes);
  const ultima = vendas.at(-1);
  const referencia = atual;
  const total = referencia ? totalizar(referencia) : null;
  const ticket = total ? ticketMedioAnotai(total.subtotal, total.pedidos) : null;
  const inicioSalao = inicioSalaoAnotai(vendas);

  return (
    <section className="anotai-panel panel" aria-labelledby="anotai-titulo">
      <div className="anotai-head">
        <div>
          <h2 id="anotai-titulo"><ShoppingBag size={21} aria-hidden="true" /> Faturamento realizado da Vila</h2>
          <p>Exportação de pedidos do Anotaí · Finalizados e expirados pagos · Sem frete</p>
        </div>
        <div className="anotai-acoes">
          {atual && <AplicarFaturamento venda={atual} inicioSalao={inicioSalao} />}
          {!detalhado && ultima && (
            <button type="button" className="button" onClick={() => ir("relatorios")}>
              <ChartColumnIncreasing size={16} aria-hidden="true" /> Ver evolução
            </button>
          )}
        </div>
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
            <span>{formatos.mes.format(dataMes(referencia.competencia))}</span>
            {referencia.periodoAte && <span className="anotai-selo-parcial">{rotuloParcial(referencia.periodoAte)}</span>}
            <strong>{dinheiro(total.subtotal)}</strong>
            <small>{pedidos(total.pedidos)} contabilizados</small>
            {ticket !== null && <small>Ticket médio {dinheiro(ticket)}</small>}
          </div>
          <Modalidades venda={referencia} inicioSalao={inicioSalao} />
        </div>
      )}
      {detalhado && atual && <ConferenciaAnotai venda={atual} />}
      {detalhado && vendas.length > 0 && <EvolucaoAnotai vendas={vendas} mes={mes} inicioSalao={inicioSalao} />}
      {inicioSalao && (
        <p className="anotai-cobertura">Os relatórios incluem vendas do salão a partir de {formatos.dia.format(new Date(`${inicioSalao}T12:00:00Z`))}.</p>
      )}
    </section>
  );
}
