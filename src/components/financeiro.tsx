"use client";

import { useState, type FormEvent } from "react";
import {
  Banknote,
  CircleAlert,
  FileSpreadsheet,
  Gauge,
  SlidersHorizontal,
  Target,
} from "lucide-react";
import { dinheiro, numeroBR, paraCentavos, percentual } from "@/lib/dna";
import {
  baseEquilibrio,
  calcularEquilibrio,
  demonstrativo,
  type FechamentoFinanceiro,
} from "@/lib/financeiro";
import { operacoes } from "@/lib/v2";
import { useSistema } from "./context";
import { Numeric } from "./numeric";
import { Field, formString, Modal, Panel } from "./ui";

const camposFechamento = [
  { nome: "receitaBruta", rotulo: "Vendas brutas" },
  { nome: "descontos", rotulo: "Descontos" },
  { nome: "estornos", rotulo: "Estornos e devoluções" },
  { nome: "impostos", rotulo: "Impostos sobre vendas" },
  { nome: "fixos", rotulo: "Despesas fixas sem aluguel compartilhado" },
] as const;

const linhasDre = [
  { chave: "receitaBruta", rotulo: "Vendas brutas" },
  { chave: "descontos", rotulo: "Descontos", subtrair: true },
  { chave: "estornos", rotulo: "Estornos e devoluções", subtrair: true },
  { chave: "receita", rotulo: "Receita após abatimentos", subtotal: true },
  { chave: "impostos", rotulo: "Impostos sobre vendas", subtrair: true },
  {
    chave: "cmv",
    rotulo: "Custo das mercadorias vendidas (CMV)",
    subtrair: true,
    origem: "DNA mensal",
  },
  {
    chave: "variaveis",
    rotulo: "Taxas e outras despesas variáveis",
    subtrair: true,
    origem: "DNA mensal",
  },
  {
    chave: "contribuicao",
    rotulo: "Margem de contribuição em reais",
    subtotal: true,
  },
  { chave: "fixos", rotulo: "Despesas fixas da operação", subtrair: true },
  {
    chave: "aluguel",
    rotulo: "Aluguel compartilhado",
    subtrair: true,
    origem: "Rateio da Vila",
  },
  { chave: "resultado", rotulo: "Resultado operacional", subtotal: true },
] as const;

function Valor({
  value,
  subtrair = false,
}: {
  value: number | null;
  subtrair?: boolean;
}) {
  if (value === null)
    return <span className="financeiro-pendente">Pendente</span>;
  return <>{dinheiro(subtrair && value > 0 ? -value : value)}</>;
}

function OperacaoFinanceiro({ value }: { value: string }) {
  return <span className="financeiro-operacao">{value}</span>;
}

export function Dre() {
  const { db, mes, restaurante, dna, atualizar, ir, selecionar } = useSistema();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [erro, setErro] = useState("");
  const consolidado = restaurante.id === "a-vila";
  const resultado = demonstrativo(db, mes, restaurante.id);
  const receitaAnotai = resultado.receitaAnotai;
  const tituloReceita = receitaAnotai ? "Receita registrada no Anotaí" : "Receita após abatimentos";
  const fechamento = db.fechamentosFinanceiros?.find(
    (registro) =>
      registro.competencia === mes &&
      registro.restaurante_id === restaurante.id,
  );

  function salvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dados = new FormData(event.currentTarget);
    const novo: FechamentoFinanceiro = {
      restaurante_id: restaurante.id,
      competencia: mes,
    };
    try {
      for (const { nome } of camposFechamento) {
        const valor = formString(dados, nome);
        if (valor !== "") novo[nome] = paraCentavos(valor);
      }
      if (
        novo.receitaBruta !== undefined &&
        (novo.descontos ?? 0) + (novo.estornos ?? 0) > novo.receitaBruta
      ) {
        throw new Error(
          "Descontos e estornos não podem superar as vendas brutas.",
        );
      }
    } catch (e) {
      setErro((e as Error).message);
      return;
    }

    if (
      atualizar((draft) => {
        const restante = (draft.fechamentosFinanceiros ?? []).filter(
          (registro) =>
            registro.competencia !== mes ||
            registro.restaurante_id !== restaurante.id,
        );
        if (camposFechamento.some(({ nome }) => novo[nome] !== undefined))
          restante.push(novo);
        draft.fechamentosFinanceiros = restante;
      }, "Fechamento do DRE salvo.")
    ) {
      setMostrarForm(false);
    }
  }

  return (
    <div className="financeiro-workspace">
      <section className="financeiro-summary" aria-labelledby="dre-resumo">
        <div className="financeiro-summary-head">
          <div>
            <OperacaoFinanceiro value={restaurante.nome} />
            <h2 id="dre-resumo">
              <FileSpreadsheet size={21} aria-hidden="true" /> Resultado do mês
            </h2>
            <p>Movimentação econômica da competência.</p>
          </div>
          {!consolidado && (
            <button
              type="button"
              className="button cream"
              onClick={() => {
                setErro("");
                setMostrarForm(true);
              }}
            >
              {fechamento ? "Editar fechamento" : "Preencher fechamento"}
            </button>
          )}
        </div>
        <div className="financeiro-metrics">
          <div>
            <span>{tituloReceita}</span>
            <strong>
              <Valor value={resultado.receita} />
            </strong>
          </div>
          <div>
            <span>Resultado operacional</span>
            <strong>
              <Valor value={resultado.resultado} />
            </strong>
          </div>
          <div>
            <span>Margem operacional</span>
            <strong>
              {resultado.margem === null ? "—" : percentual(resultado.margem)}
            </strong>
          </div>
        </div>
      </section>

      {resultado.resultado === null && (
        <div className="notice warning financeiro-notice">
          <CircleAlert size={18} aria-hidden="true" />
          <p>
            {resultado.receitaParcial
              ? "O resultado e a margem aguardam uma receita com cobertura completa da competência."
              : consolidado
                ? "Complete os custos e os demais valores pendentes de cada operação para apurar o resultado da Vila."
                : "Complete o fechamento e informe o CMV e as despesas variáveis realizados no DNA mensal. Use zero quando o valor realizado for zero."}
          </p>
        </div>
      )}

      {receitaAnotai && (
        <p className="notice">
          A receita do Anotaí é o subtotal dos pedidos finalizados, sem frete.
          {receitaAnotai.periodoAte && ` Dados até ${receitaAnotai.periodoAte.slice(8, 10)}/${receitaAnotai.periodoAte.slice(5, 7)}.`}
          {receitaAnotai.coberturaSalao === "ausente" && " Sem cobertura do salão."}
          {receitaAnotai.coberturaSalao === "parcial" && " Cobertura parcial do salão."}
          {" "}<button type="button" className="text-button" onClick={() => ir("relatorios")}>Ver vendas importadas</button>
        </p>
      )}

      <Panel
        title="Demonstrativo gerencial"
        subtitle="Vendas, descontos, estornos, impostos e despesas são valores da competência."
      >
        <dl className="financeiro-dre">
          {linhasDre.filter(({ chave }) => !receitaAnotai || !["receitaBruta", "descontos", "estornos"].includes(chave)).map((linha) => (
            <div
              key={linha.chave}
              className={
                "subtotal" in linha ? "financeiro-subtotal" : undefined
              }
            >
              <dt>
                {linha.chave === "receita" ? tituloReceita : linha.rotulo}
                {linha.chave === "receita" && receitaAnotai && <small>Pedidos finalizados sem frete</small>}
                {"origem" in linha && (
                  <small>{linha.chave === "aluguel" && resultado.aluguelProvisorio ? "Rateio provisório da Vila" : linha.origem}</small>
                )}
              </dt>
              <dd>
                <Valor
                  value={resultado[linha.chave]}
                  subtrair={"subtrair" in linha}
                />
              </dd>
            </div>
          ))}
        </dl>
      </Panel>

      {consolidado ? (
        <Panel
          title="Fechamento por operação"
          subtitle="Abra o DRE de cada operação para preencher ou revisar os valores."
        >
          <div className="financeiro-operation-list">
            {operacoes(db).map(({ id, nome }) => {
              const valor = demonstrativo(db, mes, id).resultado;
              return (
                <div key={id}>
                  <strong>{nome}</strong>
                  <span>
                    <Valor value={valor} />
                  </span>
                  <button
                    type="button"
                    className="button"
                    aria-label={`Abrir DRE de ${nome}`}
                    onClick={() => {
                      selecionar(id, mes);
                      ir("dre");
                    }}
                  >
                    Abrir DRE
                  </button>
                </div>
              );
            })}
          </div>
        </Panel>
      ) : (
        <Panel
          title="Custos realizados"
          subtitle="O DRE lê o CMV e as despesas variáveis cadastrados no DNA mensal da operação."
        >
          <button type="button" className="button" onClick={() => ir("dna")}>
            Abrir DNA mensal
          </button>
        </Panel>
      )}

      {mostrarForm && (
        <Modal title="Fechamento do DRE" close={() => setMostrarForm(false)}>
          <form onSubmit={salvar}>
            <p className="financeiro-field-note">
              Informe os totais realizados. Deixe em branco o que ainda não foi
              apurado. O aluguel compartilhado vem do rateio da Vila.
            </p>
            {dna.tipoFaturamento === "realizado" && dna.faturamento > 0 && (
              <p className="notice">
                Faturamento registrado no DNA de {dinheiro(dna.faturamento)}.
                Confira na sua fonte se o valor corresponde às vendas brutas.
              </p>
            )}
            <div className="financeiro-form-grid">
              {camposFechamento.map(({ nome, rotulo }) => (
                <Field key={nome} label={`${rotulo} (R$)`}>
                  <Numeric
                    moeda
                    name={nome}
                    min={0}
                    max={99999999999}
                    defaultValue={
                      fechamento?.[nome] === undefined
                        ? ""
                        : fechamento[nome] / 100
                    }
                    placeholder="Pendente"
                  />
                </Field>
              ))}
            </div>
            {erro && (
              <p className="notice warning" role="alert">
                {erro}
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="button"
                onClick={() => setMostrarForm(false)}
              >
                Cancelar
              </button>
              <button type="submit" className="button primary">
                Salvar fechamento
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

const camposAliquota = [
  { nome: "cmv", rotulo: "CMV" },
  { nome: "variaveis", rotulo: "Taxas e despesas variáveis" },
  { nome: "impostos", rotulo: "Impostos sobre vendas" },
] as const;

type BaseEquilibrio = ReturnType<typeof baseEquilibrio>;
type Simulacao = Pick<BaseEquilibrio, "fixos" | "aliquotas">;

function formatarAliquota(valor: number | null) {
  return valor === null
    ? ""
    : (valor * 100).toLocaleString("pt-BR", {
        maximumFractionDigits: 8,
        useGrouping: false,
      });
}

export function PontoEquilibrio() {
  const { db, restaurante, mes, ir } = useSistema();
  const [dias, setDias] = useState("");
  const [simulacao, setSimulacao] = useState<Simulacao | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [erro, setErro] = useState("");
  const base = baseEquilibrio(db, mes, restaurante.id);
  const { fixos, aliquotas } = simulacao ?? base;
  const { cmv, variaveis, impostos } = aliquotas;
  const margemContribuicao =
    cmv === null || variaveis === null || impostos === null
      ? null
      : Number((1 - cmv - variaveis - impostos).toFixed(12));
  const [ano, mesNumero] = mes.split("-").map(Number);
  const diasNoMes = new Date(Date.UTC(ano, mesNumero, 0)).getUTCDate();
  const diasRestantes =
    /^\d+$/.test(dias) && Number(dias) <= diasNoMes ? Number(dias) : null;
  const diasInvalidos = dias !== "" && diasRestantes === null;
  const estimado = Boolean(
    simulacao || base.fonteFixos === "dna" || base.fonteAliquotas === "dna",
  );
  const resultado = calcularEquilibrio(
    fixos,
    margemContribuicao,
    base.receitaReal,
    diasRestantes,
  );
  const cobertura =
    base.receitaReal !== null && resultado.ponto !== null && resultado.ponto > 0
      ? Math.max(0, base.receitaReal / resultado.ponto)
      : null;

  function aplicar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dados = new FormData(event.currentTarget);
    try {
      const valorFixo = formString(dados, "fixos");
      const novo: Simulacao = {
        fixos: valorFixo === "" ? null : paraCentavos(valorFixo),
        aliquotas: { ...aliquotas },
      };
      for (const { nome } of camposAliquota) {
        const valor = formString(dados, nome);
        const numero = valor === "" ? null : numeroBR(valor);
        if (numero !== null && (numero < 0 || numero > 100))
          throw new Error("Informe percentuais entre 0% e 100%.");
        novo.aliquotas[nome] = numero === null ? null : numero / 100;
      }
      setSimulacao(novo);
      setMostrarForm(false);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <div className="financeiro-workspace">
      <section
        className="financeiro-summary"
        aria-labelledby="equilibrio-resumo"
      >
        <div className="financeiro-summary-head">
          <div>
            <OperacaoFinanceiro value={restaurante.nome} />
            <h2 id="equilibrio-resumo">
              <Target size={22} aria-hidden="true" /> Quanto precisa vender
            </h2>
            <p>
              {simulacao
                ? "Simulação temporária"
                : fixos === null || margemContribuicao === null
                  ? "Aguardando dados do mês"
                  : estimado
                    ? "Estimativa com dados do DNA"
                    : "Base de custos realizados"}
            </p>
          </div>
          <button
            type="button"
            className="button cream"
            onClick={() => {
              setErro("");
              setMostrarForm(true);
            }}
          >
            <SlidersHorizontal size={17} aria-hidden="true" /> Simular cenário
          </button>
        </div>
        <div className="financeiro-metrics">
          <div>
            <span>Ponto de equilíbrio</span>
            <strong>
              <Valor value={resultado.ponto} />
            </strong>
          </div>
          <div>
            <span>Receita registrada após abatimentos</span>
            <strong>
              <Valor value={base.receitaReal} />
            </strong>
          </div>
          <div>
            <span>Quanto falta vender</span>
            <strong>
              <Valor value={resultado.falta} />
            </strong>
          </div>
        </div>
        {cobertura !== null && (
          <div className="financeiro-cobertura">
            <span>
              {cobertura >= 1
                ? "Ponto de equilíbrio atingido"
                : `${percentual(cobertura)} do ponto de equilíbrio`}
            </span>
            <progress
              aria-label="Proporção do ponto de equilíbrio alcançada"
              value={Math.min(cobertura, 1)}
              max={1}
            />
          </div>
        )}
      </section>

      {(fixos === null ||
        margemContribuicao === null ||
        margemContribuicao <= 0) && (
        <div className="notice warning financeiro-notice">
          <CircleAlert size={18} aria-hidden="true" />
          <p>
            {margemContribuicao !== null && margemContribuicao <= 0
              ? "Com estas taxas, CMV e impostos, a margem de contribuição não é positiva. Revise os percentuais para encontrar um ponto de equilíbrio."
              : "Preencha os custos realizados no DRE ou informe os valores faltantes em Simular cenário para calcular o ponto de equilíbrio."}
          </p>
        </div>
      )}

      <div className="financeiro-equilibrio-grid">
        <Panel
          title="Base de cálculo"
          subtitle="Despesas fixas totais divididas pela margem de contribuição."
        >
          <dl className="financeiro-dre">
            <div>
              <dt>Despesas fixas com aluguel</dt>
              <dd>
                <Valor value={fixos} />
              </dd>
            </div>
            {camposAliquota.map(({ nome, rotulo }) => (
              <div key={nome}>
                <dt>{rotulo}</dt>
                <dd>
                  {aliquotas[nome] === null ? "—" : percentual(aliquotas[nome])}
                </dd>
              </div>
            ))}
            <div className="financeiro-subtotal">
              <dt>Margem de contribuição</dt>
              <dd>
                {margemContribuicao === null
                  ? "—"
                  : percentual(margemContribuicao)}
              </dd>
            </div>
          </dl>
          {simulacao ? (
            <button
              type="button"
              className="button"
              onClick={() => setSimulacao(null)}
            >
              Voltar à base cadastrada
            </button>
          ) : (
            <button type="button" className="button" onClick={() => ir("dre")}>
              Abrir DRE do mês
            </button>
          )}
        </Panel>
        <Panel
          title="Meta por dia de funcionamento"
          subtitle="Divida a venda que falta pelos dias em que a operação ainda vai funcionar no mês."
        >
          <Field label="Dias de funcionamento restantes">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={diasNoMes}
              step={1}
              aria-invalid={diasInvalidos}
              aria-describedby={
                diasInvalidos ? "financeiro-dias-invalidos" : undefined
              }
              value={dias}
              onChange={(event) => setDias(event.target.value)}
            />
          </Field>
          {diasInvalidos && (
            <p id="financeiro-dias-invalidos" className="financeiro-pendente">
              Informe de 0 a {diasNoMes} dias.
            </p>
          )}
          <div className="financeiro-daily">
            <span>
              <Gauge size={18} aria-hidden="true" /> Venda necessária por dia
            </span>
            <strong>
              <Valor value={resultado.porDia} />
            </strong>
          </div>
        </Panel>
      </div>

      {mostrarForm && (
        <Modal
          title="Simular ponto de equilíbrio"
          close={() => setMostrarForm(false)}
        >
          <form onSubmit={aplicar}>
            <p className="financeiro-field-note">
              Inclua o aluguel na despesa fixa e use taxas representativas das
              suas vendas. Os valores do cenário ficam nesta tela.
            </p>
            <div className="financeiro-form-grid">
              <Field label="Despesas fixas com aluguel (R$)">
                <Numeric
                  moeda
                  name="fixos"
                  min={0}
                  max={99999999999}
                  defaultValue={fixos === null ? "" : fixos / 100}
                />
              </Field>
              {camposAliquota.map(({ nome, rotulo }) => (
                <Field key={nome} label={`${rotulo} (%)`}>
                  <Numeric
                    name={nome}
                    min={0}
                    max={100}
                    defaultValue={formatarAliquota(aliquotas[nome])}
                  />
                </Field>
              ))}
            </div>
            {erro && (
              <p className="notice warning" role="alert">
                {erro}
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="button"
                onClick={() => setMostrarForm(false)}
              >
                Cancelar
              </button>
              <button type="submit" className="button primary">
                <Banknote size={17} aria-hidden="true" /> Calcular cenário
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
