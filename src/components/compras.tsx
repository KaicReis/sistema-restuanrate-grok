"use client";
import { useRef, useState } from "react";
import { useSistema } from "./context";
import { confirmarCompra, sugerirInsumo, type Compra } from "@/lib/purchases";
import { Panel } from "./ui";
export function Compras() {
  const { db, restaurante, atualizar, avisar } = useSistema(),
    input = useRef<HTMLInputElement>(null),
    [nota, setNota] = useState<Compra | null>(null),
    [busy, setBusy] = useState(false),
    [qr, setQr] = useState(""),
    [error, setError] = useState("");
  async function extract(file?: File, qrValue?: string) {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      if (file) form.set("photo", file);
      else form.set("qr", qrValue ?? qr);
      const response = await fetch("/api/purchases/extract", {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      const n = result.nota;
      if (!Array.isArray(n.itens) || n.itens.length > 300)
        throw new Error("Nota ilegível. Tente outra foto.");
      setNota({
        id: crypto.randomUUID(),
        restaurante_id: restaurante.id,
        fornecedor: n.fornecedor ?? "",
        data: n.data ?? "",
        itens: n.itens.map((i: Record<string, unknown>) => ({
          nome: typeof i.nome === "string" ? i.nome : "",
          quantidade: typeof i.quantidade === "number" ? i.quantidade : 0,
          unidade: ["kg", "g", "L", "ml", "un"].includes(String(i.unidade))
            ? i.unidade
            : "un",
          valorUnitario:
            typeof i.valorUnitario === "number" ? i.valorUnitario : 0,
          total: typeof i.total === "number" ? i.total : 0,
          insumo_id: sugerirInsumo(db, restaurante.id, String(i.nome ?? "")),
        })),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function scan(file?: File) {
    if (!file) return;
    try {
      const Detector = (
        window as unknown as {
          BarcodeDetector?: new (options: { formats: string[] }) => {
            detect: (image: ImageBitmap) => Promise<{ rawValue: string }[]>;
          };
        }
      ).BarcodeDetector;
      if (!Detector)
        throw new Error(
          "Leitura automática indisponível neste navegador. Use a câmera do celular para copiar o link e cole abaixo.",
        );
      const bitmap = await createImageBitmap(file);
      let results;
      try {
        results = await new Detector({ formats: ["qr_code"] }).detect(bitmap);
      } finally {
        bitmap.close();
      }
      if (!results.length) throw new Error("QR Code não encontrado.");
      setQr(results[0].rawValue);
      await extract(undefined, results[0].rawValue);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Panel title="Compras da operação">
      <button
        className="button primary"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? "Lendo nota…" : "Lançar compra"}
      </button>
      <input
        className="sr-only"
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={(e) => void extract(e.target.files?.[0])}
      />
      <p>
        Fotografe o cupom/nota (JPG, PNG ou WebP até 3 MB). Revise todos os
        campos antes de confirmar.
      </p>
      <label className="field">
        Ler QR Code da NFC-e
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={busy}
          onChange={(e) => void scan(e.target.files?.[0])}
        />
      </label>
      <label className="field">
        Link do QR Code NFC-e
        <input type="url" value={qr} onChange={(e) => setQr(e.target.value)} />
      </label>
      <button
        className="button"
        disabled={busy || !qr}
        onClick={() => void extract()}
      >
        Consultar NFC-e
      </button>
      {error && (
        <p role="alert" className="notice warning">
          {error}
        </p>
      )}
      {nota && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              if (
                atualizar(
                  (d) => confirmarCompra(d, nota),
                  "Compra salva. Custos das receitas e pratos atualizados.",
                )
              ) {
                setNota(null);
                setError("");
              }
            } catch (e) {
              avisar((e as Error).message);
            }
          }}
        >
          <h3>Revisar compra · {restaurante.nome}</h3>
          <label className="field">
            Fornecedor
            <input
              required
              value={nota.fornecedor}
              onChange={(e) => setNota({ ...nota, fornecedor: e.target.value })}
            />
          </label>
          <label className="field">
            Data
            <input
              type="date"
              required
              value={nota.data}
              onChange={(e) => setNota({ ...nota, data: e.target.value })}
            />
          </label>
          {nota.itens.map((line, index) => {
            const patch = (values: Partial<typeof line>) =>
              setNota({
                ...nota,
                itens: nota.itens.map((l, i) =>
                  i === index ? { ...l, ...values } : l,
                ),
              });
            return (
              <fieldset key={index}>
                <legend>Item {index + 1}</legend>
                <div className="form-grid">
                  <label className="field">
                    Descrição
                    <input
                      required
                      value={line.nome}
                      onChange={(e) => patch({ nome: e.target.value })}
                    />
                  </label>
                  {(["quantidade", "valorUnitario", "total"] as const).map(
                    (key) => (
                      <label className="field" key={key}>
                        {key === "quantidade"
                          ? "Quantidade"
                          : key === "total"
                            ? "Total (R$)"
                            : "Valor unitário (R$)"}
                        <input
                          type="number"
                          min={key === "quantidade" ? 0.000001 : 0}
                          step="any"
                          required
                          value={line[key]}
                          onChange={(e) =>
                            patch({ [key]: Number(e.target.value) })
                          }
                        />
                      </label>
                    ),
                  )}
                  <label className="field">
                    Unidade
                    <select
                      value={line.unidade}
                      onChange={(e) =>
                        patch({
                          unidade: e.target.value as typeof line.unidade,
                        })
                      }
                    >
                      {["kg", "g", "L", "ml", "un"].map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Insumo sugerido (revise)
                    <select
                      value={line.ignorar ? "ignore" : (line.insumo_id ?? "")}
                      onChange={(e) =>
                        patch({
                          ignorar: e.target.value === "ignore",
                          insumo_id:
                            e.target.value === "ignore" || !e.target.value
                              ? undefined
                              : e.target.value,
                        })
                      }
                    >
                      <option value="">Criar insumo novo</option>
                      <option value="ignore">Ignorar linha</option>
                      {db.insumos
                        .filter((i) => i.restaurante_id === restaurante.id)
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.nome}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              </fieldset>
            );
          })}
          <p>
            O último lançamento confirmado na competência define o preço do mês.
            A quantidade e a unidade da embalagem serão usadas para recalcular
            os custos. Compras antigas preservam preços de meses posteriores.
          </p>
          <button className="button primary">Confirmar compra</button>
          <button
            className="button"
            type="button"
            onClick={() => setNota(null)}
          >
            Cancelar
          </button>
        </form>
      )}
      <h3>Histórico de compras</h3>
      {(db.compras ?? [])
        .filter((c) => c.restaurante_id === restaurante.id)
        .sort((a, b) => b.data.localeCompare(a.data))
        .map((c) => (
          <details key={c.id}>
            <summary>
              {c.data} · {c.fornecedor} · R${" "}
              {c.itens
                .filter((i) => !i.ignorar)
                .reduce((s, i) => s + i.total, 0)
                .toFixed(2)}
            </summary>
            {c.itens.map((i, n) => (
              <p key={n}>
                {i.nome} · {i.quantidade} {i.unidade} · R$ {i.total.toFixed(2)}{" "}
                {i.ignorar ? "(ignorado)" : ""}
              </p>
            ))}
          </details>
        ))}
    </Panel>
  );
}
