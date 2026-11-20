"use client";
import { insumoArquivado } from "@/lib/insumos";
import { useEffect, useRef, useState } from "react";
import { useSistema } from "./context";
import {
  confirmarCompra,
  prepararLinha,
  resumoCompra,
  custoUnitario,
  converterConteudo,
  totalPorCusto,
  type Compra,
} from "@/lib/purchases";
import { numeroBR, formatarBR } from "@/lib/purchase-numbers";
import { validarNota } from "@/lib/purchase-validation";
import { prepararFoto } from "@/lib/prepare-photo";
import { dinheiro } from "@/lib/dna";
import { AlertTriangle, FileUp, QrCode, ReceiptText } from "lucide-react";
import { Modal, Panel } from "./ui";
export function Compras() {
  const { db, restaurante, atualizar, avisar } = useSistema(),
    input = useRef<HTMLInputElement>(null),
    qrInput = useRef<HTMLInputElement>(null),
    reviewCursor = useRef(-1),
    [cancelar, setCancelar] = useState(false),
    [nota, setNota] = useState<Compra | null>(null),
    [preparando, setPreparando] = useState(false),
    [conferido, setConferido] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [qr, setQr] = useState(""),
    [error, setError] = useState("");
  const historico = (db.compras ?? [])
    .filter((compra) => compra.restaurante_id === restaurante.id)
    .sort((a, b) => b.data.localeCompare(a.data));
  const validacao = nota ? validarNota(nota) : null;
  const assinatura = JSON.stringify(nota);
  const podeConfirmar = validacao?.valido || conferido === assinatura;
  async function extract(file?: File, qrValue?: string) {
    setBusy(true);
    setError("");
    setConferido(null);
    reviewCursor.current = -1;
    try {
      const form = new FormData();
      if (file) {
        setPreparando(true);
        try {
          form.set("photo", await prepararFoto(file));
        } finally {
          setPreparando(false);
        }
      } else form.set("qr", qrValue ?? qr);
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
        emitente: n.emitente || undefined,
        chave: n.chave || undefined,
        originais: n.originais,
        ...Object.fromEntries(
          [
            "desconto",
            "frete",
            "outrasDespesas",
            "totalProdutos",
            "totalNota",
          ].map((k) => [k, n[k] == null ? undefined : numeroBR(n[k])]),
        ),
        itens: n.itens.map((i: Record<string, unknown>) =>
          prepararLinha(db, restaurante.id, n, {
            nome: String(i.nome ?? ""),
            codigo: i.codigo ? String(i.codigo) : undefined,
            unidadeComercial: String(i.unidadeComercial ?? i.unidade ?? ""),
            quantidade: i.quantidade == null ? NaN : numeroBR(i.quantidade),
            unidade: "un",
            valorUnitario:
              i.valorUnitario == null ? NaN : numeroBR(i.valorUnitario),
            total: i.total == null ? NaN : numeroBR(i.total),
            descontoItem:
              i.descontoItem == null ? undefined : numeroBR(i.descontoItem),
            originais: i.originais as Record<string, string | null> | undefined,
          }),
        ),
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
    <div className="purchase-workspace">
      <Panel
        title="Registrar compra"
        subtitle="Importe a nota e revise os itens antes de confirmar."
      >
        <div className="purchase-entry-options">
          <section
            className="purchase-entry-card"
            aria-labelledby="purchase-file-heading"
          >
            <span className="workflow-icon">
              <FileUp size={22} aria-hidden="true" />
            </span>
            <h3 id="purchase-file-heading">Arquivo ou foto da nota</h3>
            <p>Envie uma foto, um PDF da DANFE com texto ou o XML da NF-e.</p>
            <button
              type="button"
              className="button primary"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {preparando
                ? "Preparando foto…"
                : busy
                  ? "Lendo nota…"
                  : "Tirar foto ou enviar arquivo"}
            </button>
            <input
              hidden
              ref={input}
              type="file"
              accept="image/*,.heic,.heif,application/pdf,application/xml,text/xml,.xml,.pdf"
              onChange={(e) => void extract(e.target.files?.[0])}
            />
          </section>
          <section
            className="purchase-entry-card"
            aria-labelledby="purchase-qr-heading"
          >
            <span className="workflow-icon">
              <QrCode size={22} aria-hidden="true" />
            </span>
            <h3 id="purchase-qr-heading">QR Code da NFC-e</h3>
            <label className="field">
              Link do QR Code
              <input
                type="url"
                value={qr}
                onChange={(e) => setQr(e.target.value)}
              />
            </label>
            <div className="purchase-qr-actions">
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => qrInput.current?.click()}
              >
                Escanear QR Code
              </button>
              <input
                hidden
                ref={qrInput}
                type="file"
                accept="image/*"
                capture="environment"
                disabled={busy}
                onChange={(e) => void scan(e.target.files?.[0])}
              />
              <button
                type="button"
                className="button"
                disabled={busy || !qr}
                onClick={() => void extract()}
              >
                Consultar NFC-e
              </button>
            </div>
          </section>
        </div>
      </Panel>
      {error && (
        <p role="alert" className="notice warning">
          {error}
        </p>
      )}
      {nota && (
        <Panel title="Revisar compra" subtitle={restaurante.nome}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              try {
                if (!podeConfirmar)
                  throw new Error(
                    "Corrija as linhas divergentes ou marque conferi.",
                  );
                if (
                  atualizar(
                    (d) => confirmarCompra(d, nota, conferido === assinatura),
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
            <div className="review-summary" role="status">
              {new Set(validacao?.linhas.map((l) => l.index)).size} linhas
              precisam de revisão{" "}
              <button
                type="button"
                className="button"
                onClick={() => {
                  const cards = Array.from(
                    document.querySelectorAll<HTMLElement>(
                      ".linha-divergente[data-review]",
                    ),
                  );
                  const next =
                    cards.find(
                      (el) => Number(el.dataset.review) > reviewCursor.current,
                    ) ?? cards[0];
                  if (next) reviewCursor.current = Number(next.dataset.review);
                  next?.scrollIntoView({ behavior: "smooth", block: "center" });
                  next?.focus({ preventScroll: true });
                }}
              >
                Próxima linha
              </button>
            </div>
            <label className="field">
              Fornecedor
              <input
                required
                value={nota.fornecedor}
                onChange={(e) =>
                  setNota({ ...nota, fornecedor: e.target.value })
                }
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
            <div className="form-grid">
              {(
                [
                  "totalProdutos",
                  "desconto",
                  "frete",
                  "outrasDespesas",
                  "totalNota",
                ] as const
              ).map((key) => (
                <label className="field" key={key}>
                  {
                    {
                      totalProdutos: "Total dos produtos",
                      desconto: "Desconto da nota",
                      frete: "Frete",
                      outrasDespesas: "Outras despesas",
                      totalNota: "Total da nota",
                    }[key]
                  }{" "}
                  (R$)
                  <NumeroCompra
                    optional
                    value={nota[key]}
                    onChange={(value) => setNota({ ...nota, [key]: value })}
                  />
                </label>
              ))}
            </div>
            <p className="notice">
              Valor unitário ÷ conteúdo por embalagem define o custo do insumo.
              Desconto, frete e outras despesas são apenas informativos.
            </p>
            {!!validacao?.totais.length && (
              <div role="status" className="notice">
                {validacao.totais.map((t) => (
                  <p key={t}>Aviso informativo: {t}</p>
                ))}
              </div>
            )}
            {!validacao?.valido && (
              <label className="negative">
                <input
                  type="checkbox"
                  checked={conferido === assinatura}
                  onChange={(e) =>
                    setConferido(e.target.checked ? assinatura : null)
                  }
                />{" "}
                Conferi as linhas divergentes na nota original
              </label>
            )}
            {nota.chave && (
              <p>
                Chave NF-e: {nota.chave} · Emitente: {nota.emitente}
              </p>
            )}
            {nota.originais && (
              <details>
                <summary>Dados originais da nota</summary>
                <pre>{JSON.stringify(nota.originais, null, 2)}</pre>
              </details>
            )}
            {nota.itens.map((line, index) => {
              const patch = (values: Partial<typeof line>) =>
                setNota({
                  ...nota,
                  itens: nota.itens.map((l, i) =>
                    i === index ? { ...l, ...values } : l,
                  ),
                });
              const custo = custoUnitario(line);
              return (
                <fieldset
                  tabIndex={-1}
                  data-review={index}
                  key={index}
                  className={`purchase-item ${validacao?.linhas.some((l) => l.index === index) ? "linha-divergente" : ""}`}
                >
                  <legend>Item {index + 1}</legend>
                  <div className="purchase-summary">
                    <h4>{line.nome || "Descrição não informada"}</h4>
                    <p>
                      {formatarBR(line.quantidade)} ×{" "}
                      {line.unidadeComercial || line.unidade} · Unitário:{" "}
                      {dinheiro(Math.round(line.valorUnitario * 100))} · Custo:{" "}
                      {dinheiro(Math.round(custo * 100))}/{line.unidade}
                    </p>
                    <p>
                      Insumo vinculado:{" "}
                      {line.ignorar
                        ? "Linha ignorada"
                        : (db.insumos.find((i) => i.id === line.insumo_id)
                            ?.nome ?? "Novo insumo")}
                    </p>
                  </div>
                  {validacao?.linhas
                    .filter((l) => l.index === index)
                    .map((l) => (
                      <p
                        className="negative divergence-message"
                        role="alert"
                        key={l.index}
                      >
                        <AlertTriangle size={18} />
                        {l.mensagem}
                      </p>
                    ))}
                  <details open={line.conversaoPendente || undefined}>
                    <summary>Editar detalhes</summary>
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
                            <NumeroCompra
                              value={line[key]}
                              positive={key === "quantidade"}
                              onChange={(value) => patch({ [key]: value })}
                            />
                          </label>
                        ),
                      )}
                      <label className="field">
                        Unidade do insumo
                        <select
                          value={line.unidade}
                          onChange={(e) =>
                            (() => {
                              const unidade = e.target
                                .value as typeof line.unidade;
                              try {
                                patch({
                                  unidade,
                                  conteudo: converterConteudo(
                                    line.conteudo ?? 1,
                                    line.unidade,
                                    unidade,
                                  ),
                                });
                              } catch {
                                patch({ unidade, conversaoPendente: true });
                              }
                            })()
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
                          value={
                            line.ignorar ? "ignore" : (line.insumo_id ?? "")
                          }
                          onChange={(e) =>
                            (() => {
                              const insumo = db.insumos.find(
                                (i) => i.id === e.target.value,
                              );
                              let conteudo = line.conteudo ?? 1;
                              let pendente = line.conversaoPendente;
                              if (insumo) {
                                try {
                                  conteudo = converterConteudo(
                                    conteudo,
                                    line.unidade,
                                    insumo.unidade,
                                  );
                                } catch {
                                  pendente = true;
                                }
                              }
                              patch({
                                ignorar: e.target.value === "ignore",
                                insumo_id: insumo?.id,
                                unidade: insumo?.unidade ?? line.unidade,
                                conteudo,
                                conversaoPendente: pendente,
                              });
                            })()
                          }
                        >
                          <option value="">Criar insumo novo</option>
                          <option value="ignore">Ignorar linha</option>
                          {db.insumos
                            .filter((i) => i.restaurante_id === restaurante.id && !insumoArquivado(i))
                            .map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.nome}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="field">
                        Unidade comercial (CX, PC, FD, UN, KG…)
                        <input
                          value={line.unidadeComercial ?? ""}
                          onChange={(e) =>
                            patch({ unidadeComercial: e.target.value })
                          }
                        />
                      </label>
                      <label className="field">
                        Quantidade total na unidade do insumo (ajusta conteúdo)
                        <NumeroCompra
                          positive
                          value={line.quantidade * (line.conteudo ?? 1)}
                          onChange={(value) =>
                            patch({
                              conteudo: value / line.quantidade,
                              conversaoPendente: false,
                            })
                          }
                        />
                      </label>
                      <label className="field">
                        Custo por {line.unidade} pelo valor unitário
                        <NumeroCompra
                          value={custo}
                          onChange={(value) => {
                            const valorUnitario = Number(
                              (value * (line.conteudo ?? 1)).toFixed(4),
                            );
                            patch({
                              valorUnitario,
                              total: totalPorCusto(
                                nota,
                                index,
                                valorUnitario / (line.conteudo ?? 1),
                              ),
                            });
                          }}
                        />
                      </label>
                      <label className="field">
                        Desconto do item (informativo)
                        <NumeroCompra
                          optional
                          value={line.descontoItem}
                          onChange={(descontoItem) => patch({ descontoItem })}
                        />
                      </label>
                      <label className="field">
                        Código do fornecedor
                        <input
                          value={line.codigo ?? ""}
                          onChange={(e) => patch({ codigo: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        Conteúdo por embalagem na unidade do insumo
                        <NumeroCompra
                          positive
                          value={line.conteudo ?? 1}
                          onChange={(conteudo) =>
                            patch({ conteudo, conversaoPendente: false })
                          }
                        />
                      </label>
                    </div>
                    <p>
                      {formatarBR(line.quantidade)} {line.unidadeComercial} ×{" "}
                      {formatarBR(line.conteudo ?? 1)} {line.unidade} por
                      embalagem ={" "}
                      {formatarBR(line.quantidade * (line.conteudo ?? 1))}{" "}
                      {line.unidade}. Custo pelo valor unitário: R${" "}
                      {formatarBR(custo)} / {line.unidade}.
                    </p>
                    {line.conversaoPendente && (
                      <label className="field">
                        <span role="alert">
                          Revise o conteúdo por embalagem e a unidade do insumo.
                        </span>
                        <span>
                          <input
                            type="checkbox"
                            onChange={(e) =>
                              patch({ conversaoPendente: !e.target.checked })
                            }
                          />{" "}
                          Confirmo o conteúdo e a unidade revisados
                        </span>
                      </label>
                    )}
                    {line.originais && (
                      <details>
                        <summary>Texto original da nota</summary>
                        <pre>{JSON.stringify(line.originais, null, 2)}</pre>
                      </details>
                    )}
                  </details>
                </fieldset>
              );
            })}
            <p>
              O último lançamento confirmado na competência define o preço do
              mês. O valor unitário e o conteúdo por embalagem serão usados para
              recalcular os custos. O vínculo e a conversão serão lembrados por
              fornecedor e produto. Compras antigas preservam preços de meses
              posteriores.
            </p>
            <div className="purchase-actions">
              <button className="button primary" disabled={!podeConfirmar}>
                Confirmar compra ({nota.itens.filter((i) => !i.ignorar).length}{" "}
                itens)
              </button>
              <button
                className="button"
                type="button"
                onClick={() => setCancelar(true)}
              >
                Cancelar
              </button>
            </div>
          </form>
        </Panel>
      )}
      {cancelar && (
        <Modal
          title="Cancelar revisão da compra?"
          close={() => setCancelar(false)}
        >
          <p>Os ajustes desta revisão serão descartados.</p>
          <div className="form-actions">
            <button className="button" onClick={() => setCancelar(false)}>
              Continuar revisão
            </button>
            <button
              className="button primary"
              onClick={() => {
                setNota(null);
                setCancelar(false);
              }}
            >
              Descartar revisão
            </button>
          </div>
        </Modal>
      )}
      <Panel
        title="Histórico de compras"
        subtitle={`${historico.length} ${historico.length === 1 ? "nota registrada" : "notas registradas"} nesta operação`}
      >
        {historico.length === 0 && (
          <p className="muted">
            As notas confirmadas aparecem aqui com o fornecedor, os itens e o
            valor da compra.
          </p>
        )}
        <div className="purchase-history-list">
          {historico.map((c) => (
            <details className="purchase-history" key={c.id}>
              <summary>
                <span className="workflow-icon">
                  <ReceiptText size={19} aria-hidden="true" />
                </span>
                <span className="purchase-history-name">
                  <strong>{c.fornecedor || "Fornecedor não informado"}</strong>
                  <span>
                    {c.data.split("-").reverse().join("/")} · {c.itens.length}{" "}
                    {c.itens.length === 1 ? "item" : "itens"}
                  </span>
                </span>
                <strong>
                  {dinheiro(Math.round(resumoCompra(c).total * 100))}
                </strong>
              </summary>
              <ul>
                {c.itens.map((i, n) => (
                  <li key={n}>
                    <span>
                      {i.nome}
                      {i.ignorar ? " (ignorado)" : ""}
                    </span>
                    <span>
                      {formatarBR(i.quantidade)} {i.unidade}
                    </span>
                    <strong>{dinheiro(Math.round(i.total * 100))}</strong>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function NumeroCompra({
  value,
  onChange,
  positive = false,
  optional = false,
}: {
  value?: number;
  onChange: (value: number) => void;
  positive?: boolean;
  optional?: boolean;
}) {
  const [texto, setTexto] = useState(
    value === undefined ? "" : formatarBR(value),
  );
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement !== ref.current) {
      setTexto(value === undefined ? "" : formatarBR(value));
      if (
        (value === undefined && optional) ||
        (value !== undefined &&
          Number.isFinite(value) &&
          value >= 0 &&
          (!positive || value > 0))
      )
        ref.current?.setCustomValidity("");
    }
  }, [value]);
  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      required={!optional}
      value={texto}
      onChange={(e) => {
        setTexto(e.target.value);
        try {
          if (optional && !e.target.value.trim()) {
            e.target.setCustomValidity("");
            onChange(undefined as unknown as number);
            return;
          }
          const n = numeroBR(e.target.value);
          if (n < 0 || (positive && n <= 0))
            throw new Error(
              positive
                ? "Informe valor maior que zero"
                : "Informe valor não negativo",
            );
          e.target.setCustomValidity("");
          onChange(n);
        } catch (error) {
          e.target.setCustomValidity((error as Error).message);
          try {
            onChange(NaN);
          } catch {
            /* Keep the previous cost when the derived total is invalid. */
          }
        }
      }}
    />
  );
}
