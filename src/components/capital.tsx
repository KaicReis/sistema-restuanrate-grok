"use client";
import { useSistema } from "./context";
import { calcularCapital, type Capital } from "@/lib/capital";
import { ratear, operacoes } from "@/lib/v2";
import { Panel } from "./ui";
const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    n / 100,
  );
export function CapitalGiro({
  consolidado = false,
}: {
  consolidado?: boolean;
}) {
  const { db, restaurante, mes, atualizar } = useSistema();
  const rows = (consolidado ? operacoes(db) : [restaurante]).map((r) => ({
    r,
    c: db.capitais?.find(
      (c) => c.restaurante_id === r.id && c.competencia === mes,
    ),
  }));
  if (consolidado) {
    const results = rows.map(({ r, c }) => ({
      r,
      result: c ? calcularCapital(c) : null,
    }));
    const completo = results.every(
      (x) =>
        x.result?.necessario !== null && x.result?.necessario !== undefined,
    );
    return (
      <Panel title="Capital de giro · A Vila">
        <h2>
          {completo
            ? `Seu capital de giro necessário é ${brl(results.reduce((s, x) => s + x.result!.necessario!, 0))}`
            : "Consolidado pendente de preenchimento"}
        </h2>
        {results.map(({ r, result }) => (
          <p key={r.id}>
            {r.nome}:{" "}
            {result?.necessario != null
              ? brl(result.necessario)
              : result?.pendentes.join(", ") ||
                "Preencha o capital de giro da operação"}
          </p>
        ))}
      </Panel>
    );
  }
  const c: Capital = rows[0].c ?? {
    restaurante_id: restaurante.id,
    competencia: mes,
    pagamentos: ["Dinheiro/PIX", "Débito", "Crédito", "iFood/delivery"].map(
      (nome) => ({ nome }),
    ),
  };
  const result = calcularCapital(c);
  function save(next: Capital) {
    atualizar((d) => {
      d.capitais ??= [];
      const i = d.capitais.findIndex(
        (x) => x.restaurante_id === restaurante.id && x.competencia === mes,
      );
      if (i < 0) d.capitais.push(next);
      else d.capitais[i] = next;
    });
  }
  const fields = [
    ["faturamento", "Faturamento médio mensal (R$)", 100],
    ["compras", "Compras mensais de insumos (R$)", 100],
    ["fornecedores", "Prazo médio dos fornecedores (dias)", 1],
    ["estoqueReais", "Estoque médio (R$)", 100],
    ["estoqueDias", "Estoque médio (dias, tem prioridade sobre R$)", 1],
    ["fixos", "Despesas fixas sem aluguel (R$)", 100],
    ["aluguel", "Parte do aluguel rateado (R$)", 100],
    ["reserva", "Reserva de segurança (R$)", 100],
  ] as const;
  return (
    <Panel title="Capital de giro">
      <p>
        Mês gerencial de 30 dias. Custo diário = (compras + despesas fixas +
        aluguel) / 30. Ciclo = PMR + PME − PMP. Ciclo negativo não exige
        financiamento; a reserva continua incluída.
      </p>
      <div className="form-grid">
        {fields.map(([key, label, factor]) => (
          <label className="field" key={key}>
            <span>{label}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={c[key] === undefined ? "" : c[key]! / factor}
              onChange={(e) =>
                save({
                  ...c,
                  [key]:
                    e.target.value === ""
                      ? undefined
                      : Math.round(Number(e.target.value) * factor * 100) / 100,
                })
              }
            />
          </label>
        ))}
      </div>
      <button
        className="button"
        onClick={() =>
          save({ ...c, aluguel: ratear(db, mes)[restaurante.id] ?? 0 })
        }
      >
        Usar aluguel do rateio atual
      </button>
      <h3>Mix de recebimentos</h3>
      {c.pagamentos.map((p, i) => (
        <div className="form-grid" key={p.nome}>
          <strong>{p.nome}</strong>
          {(["percentual", "dias"] as const).map((key) => (
            <label className="field" key={key}>
              <span>{key === "dias" ? "Prazo (dias)" : "Mix (%)"}</span>
              <input
                type="number"
                min="0"
                max={key === "percentual" ? 100 : undefined}
                step="0.01"
                value={p[key] ?? ""}
                onChange={(e) => {
                  const pagamentos = structuredClone(c.pagamentos);
                  pagamentos[i][key] =
                    e.target.value === "" ? undefined : Number(e.target.value);
                  save({ ...c, pagamentos });
                }}
              />
            </label>
          ))}
        </div>
      ))}
      {result.necessario === null ? (
        <div className="notice warning">
          Pendente: {result.pendentes.join("; ")}
        </div>
      ) : (
        <>
          <h2>Seu capital de giro necessário é {brl(result.necessario)}</h2>
          <p>
            PMR: {result.pmr!.toFixed(1)} dias · PME: {result.pme!.toFixed(1)}{" "}
            dias · PMP: {result.pmp!.toFixed(1)} dias · Ciclo:{" "}
            {result.ciclo!.toFixed(1)} dias · Custo diário:{" "}
            {brl(result.diario!)}
          </p>
        </>
      )}
    </Panel>
  );
}
