"use client";
import { preparoPendente } from "./readiness";
import { insumosMes } from "@/lib/v2";
import { Numeric } from "./numeric";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Search,
  TrendingUp,
} from "lucide-react";
import type { Canal, Produto } from "@/lib/types";
import {
  calcularMargens,
  calcularPrecoDNA,
  dinheiro,
  entradaPreco,
  paraCentavos,
  percentual,
} from "@/lib/dna";
import { useSistema } from "./context";
import { Empty, Field } from "./ui";
export function Precos() {
  const { db, restaurante, mes, ir } = useSistema(),
    [canalId, setCanal] = useState(
      () =>
        db.canais.find(
          (c) =>
            c.restaurante_id === restaurante.id &&
            c.competencia === mes &&
            c.nome === "Salão",
        )?.id ?? "todos",
    ),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("todos");
  const produtos = db.produtos.filter(
      (p) => p.restaurante_id === restaurante.id,
    ),
    canais = db.canais.filter(
      (c) => c.restaurante_id === restaurante.id && c.competencia === mes,
    ),
    filtered = produtos.filter(
      (p) =>
        p.nome
          .toLocaleLowerCase("pt-BR")
          .includes(search.toLocaleLowerCase("pt-BR")) &&
        (status === "todos" ||
          preparoPendente(db, mes, p) === (status === "pendentes")),
    );
  return (
    <>
      <div className="filter-chips">
        {["todos", "pendentes", "prontos"].map((f) => (
          <button
            key={f}
            className="button"
            aria-pressed={status === f}
            onClick={() => setStatus(f)}
          >
            {f === "todos"
              ? "Todos"
              : f === "pendentes"
                ? "Pendentes"
                : "Prontos"}
          </button>
        ))}
      </div>
      <div className="section-toolbar">
        <label className="search">
          <Search size={18} />
          <input
            aria-label="Buscar produto para precificação"
            placeholder="Buscar ficha…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Filtrar canal de venda"
          value={canalId}
          onChange={(e) => setCanal(e.target.value)}
        >
          <option value="todos">Todos os canais</option>
          {canais.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="notice">
        Preço mínimo arredondado <strong>para cima ao centavo</strong>. A margem
        projetada já considera os fixos uma única vez. Salve o preço praticado
        para comparar.
      </div>
      {!produtos.length ? (
        <Empty
          title="Sua próxima decisão: um preço com margem"
          description="Cadastre uma ficha técnica para calcular o preço mínimo em cada canal de venda."
          action={
            <button className="button primary" onClick={() => ir("fichas")}>
              Criar ficha técnica <ArrowRight size={17} />
            </button>
          }
        />
      ) : !canais.length ? (
        <Empty
          title="Cadastre um canal de venda"
          description="As taxas do canal são necessárias para calcular o preço."
          action={
            <button className="button primary" onClick={() => ir("canais")}>
              Cadastrar canal
            </button>
          }
        />
      ) : (
        <div className="pricing-products">
          {filtered.map((p) => (
            <section className="pricing-product" key={p.id}>
              <div className="pricing-heading">
                <span className="ingredient-icon">
                  <TrendingUp size={20} />
                </span>
                <div>
                  <h2>{p.nome}</h2>
                  <p>
                    {p.rendimento} {p.rendimento === 1 ? "porção" : "porções"}{" "}
                    por receita · custos da competência selecionada
                  </p>
                </div>
              </div>
              {preparoPendente(db, mes, p) ? (
                <div className="notice warning">
                  Ficha incompleta: confira composição, quantidades e preços.{" "}
                  <button
                    className="text-button"
                    onClick={() => ir("fichas", "pendentes")}
                  >
                    Completar ficha
                  </button>
                </div>
              ) : (
                <div className="pricing-grid">
                  {canais
                    .filter((c) => canalId === "todos" || c.id === canalId)
                    .map((c) => (
                      <PrecoCard key={c.id} produto={p} canal={c} />
                    ))}
                </div>
              )}
            </section>
          ))}
          {!filtered.length && (
            <Empty
              title="Nenhum produto encontrado"
              description="Tente buscar por outro nome."
            />
          )}
        </div>
      )}
      <div className="formula-note">
        <strong>O preço por trás do número</strong>
        <code>
          PV = (CMV ingredientes + embalagem aplicada + custo/unidade) ÷ (1 −
          fixos% − variáveis% − impostos% − margem%)
        </code>
        <p>
          Margem de contribuição cobre os custos fixos e o lucro. A margem
          líquida gerencial desconta a proporção de fixos do DNA.
        </p>
      </div>
    </>
  );
}
function PrecoCard({ produto, canal }: { produto: Produto; canal: Canal }) {
  const { db, dna, atualizar, restaurante } = useSistema();
  const registro = db.precos.find(
      (p) => p.produto_id === produto.id && p.canal_id === canal.id,
    ),
    [valor, setValor] = useState(
      registro
        ? (registro.valor / 100).toFixed(2).replace(".", ",")
        : produto.precoCardapio && canal.nome === "Salão"
          ? (produto.precoCardapio / 100).toFixed(2).replace(".", ",")
          : "",
    );
  let entrada;
  try {
    entrada = entradaPreco(
      dna,
      canal,
      produto,
      insumosMes(db, dna.competencia),
      db.receitas,
    );
  } catch (e) {
    return (
      <div className="price-card">
        <h3>{canal.nome}</h3>
        <p className="negative">{(e as Error).message}</p>
        <p>Complete a ficha e os preços dos insumos antes de precificar.</p>
        {registro && <p>Preço praticado: {dinheiro(registro.valor)}</p>}
      </div>
    );
  }
  const result = calcularPrecoDNA(entrada),
    margens =
      valor && /^\d+(?:[,.]\d+)?$/.test(valor)
        ? calcularMargens(entrada, paraCentavos(valor))
        : null,
    abaixo = registro && result.viavel && registro.valor < result.precoMinimo;
  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    atualizar((draft) => {
      const i = draft.precos.findIndex(
          (p) => p.produto_id === produto.id && p.canal_id === canal.id,
        ),
        preco = {
          id: registro?.id ?? crypto.randomUUID(),
          restaurante_id: restaurante.id,
          produto_id: produto.id,
          canal_id: canal.id,
          valor: paraCentavos(valor),
        };
      if (i < 0) draft.precos.push(preco);
      else draft.precos[i] = preco;
    }, "Preço praticado salvo para este canal e competência.");
  }
  return (
    <div
      className={`price-card ${!result.viavel || abaixo ? "price-danger" : ""}`}
    >
      <div className="price-channel">
        <h3>{canal.nome}</h3>
        <span className={`pill ${!result.viavel || abaixo ? "red" : ""}`}>
          {!result.viavel
            ? "Inviável"
            : abaixo
              ? "Abaixo da meta"
              : registro && margens
                ? "Meta atendida"
                : "Informe o preço praticado"}
        </span>
      </div>
      <div className="compact-cost">
        <span>Custo / porção</span>
        <strong>
          {dinheiro(
            Number(entrada.cmvIngredientes) +
              (entrada.embalagem ?? 0) +
              (entrada.custoFixoUnidade ?? 0),
          )}
        </strong>
      </div>
      <div className="compact-minimum">
        <span>Preço mínimo</span>
        <strong>
          {result.viavel ? dinheiro(result.precoMinimo) : "Inviável"}
        </strong>
        {!result.viavel && <p className="negative">{result.motivo}</p>}
      </div>
      <form onSubmit={save} className="price-form">
        <Field label="Preço praticado (R$)">
          <Numeric
            aria-label={`Preço praticado de ${produto.nome} em ${canal.nome}`}
            type="number"
            min="0.01"
            max="99999999999"
            step="0.01"
            inputMode="decimal"
            required
            placeholder="0,00"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        </Field>
        <button
          className="icon-button save-price"
          type="submit"
          aria-label={`Salvar preço de ${produto.nome} em ${canal.nome}`}
        >
          <Check size={20} />
        </button>
      </form>
      <div className="compact-margin">
        <span>Margem · meta 30%</span>
        <strong
          className={
            margens ? (margens.margem < 0.3 ? "negative" : "positive") : "muted"
          }
        >
          {margens ? percentual(margens.margem) : "Informe o preço"}
        </strong>
      </div>
      {abaixo && (
        <p className="negative price-warning">
          <AlertTriangle size={15} /> O preço praticado não alcança a meta do
          DNA.
        </p>
      )}
      {registro?.valor === 0 && (
        <p className="negative">
          Informe um preço maior que zero para calcular as margens.
        </p>
      )}
    </div>
  );
}
