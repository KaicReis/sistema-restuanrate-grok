"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useSistema } from "./context";
import { ResumoPedidosRecebidosAnotai } from "./resumo-pedidos-recebidos-anotai";
import type { PedidoRecebido } from "@/lib/anotai-receiver";

const endpoint = "/api/anotai/pedidos";
const limite = 256 * 1024;
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dinheiro = (cents: number) => brl.format(cents / 100);
const origem: Record<string, string> = {
  "waiter-app": "Garçom", qrcode: "QR Code", pdv: "PDV", "pdv-popup": "PDV",
  totem: "Totem", site: "Site", whatsapp: "WhatsApp", "menu-share": "Compartilhamento do menu",
};
const modalidade: Record<string, string> = { LOCAL: "Consumo local", DELIVERY: "Entrega", TAKE: "Retirada" };
type Preview = { fingerprint: string; alreadyReceived: number; newCount: number; rows: PedidoRecebido[] };

function ListaPedidos({ rows, nomes }: { rows: PedidoRecebido[]; nomes: Map<string, string> }) {
  return (
    <ul aria-label="Pedidos finalizados" className="anotai-pedidos-recebidos">
      {rows.map((r, i) => (
        <li key={r.businessDate + ":" + r.reference + ":" + i}>
          <strong>Pedido {r.reference} · {r.businessDate.split("-").reverse().join("/")}</strong>
          <p>{origem[r.origin ?? ""] ?? "Origem não identificada"} · {modalidade[r.fulfillment ?? ""] ?? "Modalidade não identificada"}</p>
          <p>Itens: {dinheiro(r.merchandiseCents)} · Frete: {dinheiro(r.freightCents)} · Gorjeta: {dinheiro(r.tipCents)} · Total Anotaí: {dinheiro(r.totalCents)}</p>
          {r.allocated.length > 0 && <ul aria-label="Itens classificados">
            {r.allocated.map(a => <li key={a.sectorId}>{nomes.get(a.sectorId) ?? "Operação não identificada"}: {dinheiro(a.cents)}</li>)}
          </ul>}
          {r.pending.length > 0 && <ul aria-label="Itens pendentes">
            {r.pending.map(p => <li key={p.reason}>{p.items} {p.items === 1 ? "item" : "itens"} sem setor: {dinheiro(p.cents)} ({p.reason})</li>)}
          </ul>}
        </li>
      ))}
    </ul>
  );
}

export function PedidosRecebidosAnotai() {
  const { db, mes } = useSistema();
  const nomes = new Map(db.restaurantes.map(r => [r.id, r.nome]));
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState<{ month: string; rows: PedidoRecebido[] } | null>(null);
  const [payload, setPayload] = useState<unknown>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const control = new AbortController();
    fetch(endpoint + "?mes=" + encodeURIComponent(mes), { cache: "no-store", signal: control.signal })
      .then(async r => {
        if (control.signal.aborted) return;
        if ([401, 403, 404].includes(r.status)) { setVisible(false); return; }
        setVisible(true);
        if (!r.ok) { setData(null); setMessage("Não foi possível consultar os pedidos já salvos."); return; }
        const result = await r.json() as { rows: PedidoRecebido[] };
        if (!control.signal.aborted) setData({ month: mes, rows: result.rows.filter(r => r.businessDate.startsWith(mes + "-")) });
      }).catch(() => {});
    return () => control.abort();
  }, [mes, revision]);

  async function abrir(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setMessage(""); setPreview(null); setPayload(null);
    if (!file.size || file.size > limite) { setMessage("Selecione um JSON do coletor de até 256 KB."); return; }
    setBusy(true);
    try {
      const p: unknown = JSON.parse(await file.text());
      const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", payload: p }) });
      const result = await r.json() as Preview & { erro?: string };
      if (!r.ok) { setMessage(result.erro ?? "Não foi possível conferir."); return; }
      setPayload(p); setPreview(result);
    } catch { setMessage("O arquivo não é um JSON do coletor ou a conexão falhou."); }
    finally { setBusy(false); }
  }

  async function salvar() {
    if (!preview || !payload) return;
    setBusy(true); setMessage("");
    try {
      const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "commit", payload, fingerprint: preview.fingerprint }) });
      const result = await r.json() as { saved?: number; existing?: number; erro?: string };
      if (!r.ok) { setMessage(result.erro ?? "Não foi possível registrar."); return; }
      setMessage(`${result.saved ?? 0} novo(s) pedido(s) registrado(s); ${result.existing ?? 0} já existente(s).`);
      setPreview(null); setPayload(null); setRevision(i => i + 1);
    } catch { setMessage("Não recebi confirmação. Você pode repetir sem duplicar pedidos idênticos."); }
    finally { setBusy(false); }
  }

  if (!visible) return null;
  const pedidosDoMes = data?.month === mes ? data.rows : null;
  return <details className="panel vendas-disclosure">
    <summary>Pedidos recebidos do Anotaí</summary>
    <p>Conferência dos pedidos finalizados enviados pelo coletor. Itens de setor incerto ficam separados. Este registro não altera o DRE nem a matriz de faturamento já importada.</p>
    <label>Arquivo JSON do coletor <input type="file" accept=".json,application/json" onChange={abrir} disabled={busy} /></label>
    {message && <p role="status">{message}</p>}
    {preview && <section aria-label="Prévia da importação">
      <h3>Conferir lote antes de salvar</h3>
      <p>{preview.newCount} novo(s) · {preview.alreadyReceived} já recebido(s).</p>
      <ListaPedidos rows={preview.rows} nomes={nomes} />
      {!!preview.newCount && <button type="button" className="button primary" disabled={busy} onClick={salvar}>Registrar no Gestão</button>}
      <button type="button" className="button" disabled={busy} onClick={() => { setPayload(null); setPreview(null); }}>Descartar prévia</button>
    </section>}
    {pedidosDoMes !== null && <ResumoPedidosRecebidosAnotai key={mes} rows={pedidosDoMes} nomes={nomes} mes={mes} />}
    <section aria-label="Pedidos salvos no mês">
      <h3>Já registrados em {mes}</h3>
      {pedidosDoMes === null ? <p>Pedidos desse mês ainda não disponíveis.</p> : pedidosDoMes.length ? <ListaPedidos rows={pedidosDoMes} nomes={nomes} /> : <p>Nenhum pedido confirmado neste mês.</p>}
    </section>
  </details>;
}
