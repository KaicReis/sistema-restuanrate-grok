"use client";

import { useMemo, useState } from "react";
import type { PedidoRecebido } from "@/lib/anotai-receiver";

const origens: Record<string, string> = {
  "waiter-app": "Garçom", qrcode: "QR Code", pdv: "PDV", "pdv-popup": "PDV (popup)",
  totem: "Totem", site: "Site", whatsapp: "WhatsApp", "menu-share": "Compartilhamento do menu",
};
const modalidades: Record<string, string> = { LOCAL: "Consumo local", DELIVERY: "Entrega", TAKE: "Retirada" };
const dinheiro = (value: number) => formato.format(value / 100);
const formato = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const TODOS = "todos";
const SEM_INFORMACAO = "nao-identificado";
const origemDe = (r: PedidoRecebido) => r.origin && Object.hasOwn(origens, r.origin) ? r.origin : SEM_INFORMACAO;
const modalidadeDe = (r: PedidoRecebido) => r.fulfillment && Object.hasOwn(modalidades, r.fulfillment) ? r.fulfillment : SEM_INFORMACAO;

export function resumirPedidosRecebidos(
  rows: readonly PedidoRecebido[],
  filtro: { origem?: string; modalidade?: string } = {},
) {
  const filtrados = rows.filter(r =>
    (!filtro.origem || filtro.origem === TODOS || filtro.origem === origemDe(r)) &&
    (!filtro.modalidade || filtro.modalidade === TODOS || filtro.modalidade === modalidadeDe(r)),
  );
  const setores = new Map<string, { sectorId: string; centavos: number; pedidos: number }>();
  let pendentes = 0, itensPendentes = 0, pedidosComPendencia = 0;
  for (const r of filtrados) {
    if (r.pending.length) pedidosComPendencia++;
    for (const p of r.pending) {
      pendentes += p.cents;
      itensPendentes += p.items;
    }
    const porPedido = new Map<string, number>();
    for (const a of r.allocated) porPedido.set(a.sectorId, (porPedido.get(a.sectorId) ?? 0) + a.cents);
    for (const [id, centavos] of porPedido) {
      const atual = setores.get(id) ?? { sectorId: id, centavos: 0, pedidos: 0 };
      atual.centavos += centavos;
      atual.pedidos++;
      setores.set(id, atual);
    }
  }
  return {
    pedidos: filtrados.length,
    datas: new Set(filtrados.map(r => r.businessDate)).size,
    setores: [...setores.values()].sort((a, b) => b.centavos - a.centavos || a.sectorId.localeCompare(b.sectorId)),
    pendentes, itensPendentes, pedidosComPendencia,
  };
}

export function ResumoPedidosRecebidosAnotai({
  rows, nomes, mes,
}: {
  rows: readonly PedidoRecebido[]; nomes: ReadonlyMap<string, string>; mes: string;
}) {
  const [origem, setOrigem] = useState(TODOS);
  const [modalidade, setModalidade] = useState(TODOS);
  const resumo = useMemo(() => resumirPedidosRecebidos(rows, { origem, modalidade }), [rows, origem, modalidade]);
  const origensNoMes = [...new Set(rows.map(origemDe))];
  const modalidadesNoMes = [...new Set(rows.map(modalidadeDe))];

  return <section aria-label="Subtotal dos pedidos recebidos por setor">
    <h3>Pedidos recebidos — parcial</h3>
    <p>Somente pedidos importados e conciliados no Gestão. Não presume cobertura de todo o mês, não inclui frete nem gorjeta e não altera o DRE.</p>
    <div className="form-actions">
      <label>Origem <select aria-label="Origem dos pedidos recebidos" value={origem} onChange={e => setOrigem(e.target.value)}>
        <option value={TODOS}>Todas as origens</option>
        {origensNoMes.map(key => <option value={key} key={key}>{origens[key] ?? "Origem não identificada"}</option>)}
      </select></label>
      <label>Modalidade <select aria-label="Modalidade dos pedidos recebidos" value={modalidade} onChange={e => setModalidade(e.target.value)}>
        <option value={TODOS}>Todas as modalidades</option>
        {modalidadesNoMes.map(key => <option value={key} key={key}>{modalidades[key] ?? "Modalidade não identificada"}</option>)}
      </select></label>
    </div>
    <p role="status">{resumo.pedidos === 0
      ? "Nenhum pedido recebido para este recorte. Isso não significa faturamento zero."
      : `${resumo.pedidos} ${resumo.pedidos === 1 ? "pedido recebido" : "pedidos recebidos"} em ${resumo.datas} ${resumo.datas === 1 ? "data com pedidos" : "datas com pedidos"} de ${mes}.`}
    </p>
    {resumo.setores.length > 0 && <div className="report-table-wrap">
      <table className="report-table" aria-label="Subtotais classificados por setor">
        <thead><tr><th scope="col">Setor</th><th scope="col">Subtotal dos itens</th><th scope="col">Pedidos com itens do setor</th></tr></thead>
        <tbody>{resumo.setores.map(s => <tr key={s.sectorId}>
          <th scope="row">{nomes.get(s.sectorId) ?? "Operação não identificada"}</th>
          <td><strong>{dinheiro(s.centavos)}</strong></td>
          <td>{s.pedidos}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    {!!resumo.pedidos && <p>Um mesmo pedido pode contribuir com itens para vários setores.</p>}
    {!!resumo.itensPendentes && <p className="notice warning">Não atribuído a setor: <strong>{dinheiro(resumo.pendentes)}</strong> em {resumo.itensPendentes} {resumo.itensPendentes === 1 ? "item pendente" : "itens pendentes"}, de {resumo.pedidosComPendencia} {resumo.pedidosComPendencia === 1 ? "pedido" : "pedidos"}. Esses valores não entram nos subtotais acima.</p>}
  </section>;
}
