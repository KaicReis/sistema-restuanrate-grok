"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Wallet,
} from "lucide-react";
import { dinheiro, numeroBR, paraCentavos } from "@/lib/dna";
import { alterarVencimentoCompra } from "@/lib/purchases";
import {
  categoriasCaixa,
  dataAtualCaixa,
  LIMITE_CENTAVOS_CAIXA,
  resumirFluxoCaixa,
  ultimoDiaCaixa,
  type CategoriaCaixa,
  type MovimentoCaixa,
  type SituacaoCaixa,
  type TipoCaixa,
} from "@/lib/fluxo-caixa";
import type { Restaurante } from "@/lib/types";
import { operacoes } from "@/lib/v2";
import { useSistema } from "./context";
import { Numeric } from "./numeric";
import {
  AddButton,
  confirmarExclusao,
  Field,
  formString,
  Modal,
  Panel,
} from "./ui";
import "../app/fluxo-caixa.css";

const limiteReais = LIMITE_CENTAVOS_CAIXA / 100;
const dataBR = (data: string) => data.split("-").reverse().join("/");
const saldoBR = (valor: number | null) =>
  valor === null ? "—" : dinheiro(valor);

function IndicadorCaixa({
  titulo,
  valor,
  destaque = false,
}: {
  titulo: string;
  valor: number | null;
  destaque?: boolean;
}) {
  return (
    <div className={`caixa-indicador${destaque ? " caixa-destaque" : ""}`}>
      <dt>{titulo}</dt>
      <dd className={valor !== null && valor < 0 ? "negative" : undefined}>
        {saldoBR(valor)}
      </dd>
    </div>
  );
}

export function FluxoCaixa() {
  const { db, restaurante, mes, atualizar } = useSistema();
  const [abertura, setAbertura] = useState<Restaurante | null>(null);
  const [editar, setEditar] = useState<MovimentoCaixa | "novo" | null>(null);
  const [filtro, setFiltro] = useState("todos");
  const [erro, setErro] = useState("");
  const consolidado = restaurante.grupo || restaurante.id === "a-vila";
  const lista = consolidado ? operacoes(db) : [restaurante];
  const hoje = dataAtualCaixa();
  const caixa = resumirFluxoCaixa(
    db.saldosCaixa ?? [],
    db.movimentosCaixa ?? [],
    lista.map((r) => r.id),
    mes,
    hoje,
  );
  const movimentos = caixa.lancamentos.filter(
    (movimento) =>
      filtro === "todos" ||
      filtro === movimento.situacao ||
      (filtro === "a-pagar" && movimento.tipo === "saida" && movimento.situacao === "previsto"),
  );
  const nomes = new Map(lista.map((operacao) => [operacao.id, operacao.nome]));
  const faltaSaldo = lista.filter((r) => !caixa.abertura.has(r.id));
  const diasSeguintes = caixa.dias
    .filter((dia) => dia.data >= hoje)
    .slice(0, 7);
  const previsoesAnteriores = (db.movimentosCaixa ?? []).filter(
    (m) =>
      mes === hoje.slice(0, 7) &&
      m.situacao === "previsto" &&
      m.data < mes + "-01" &&
      nomes.has(m.restaurante_id),
  );

  function salvarAbertura(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!abertura) return;
    const form = new FormData(evento.currentTarget);
    try {
      const texto = formString(form, "saldo");
      if (!texto)
        throw new Error("Informe o saldo de abertura, mesmo quando for zero.");
      const reais = numeroBR(texto);
      const saldoCentavos = Math.sign(reais) * paraCentavos(Math.abs(reais));
      if (Math.abs(saldoCentavos) > LIMITE_CENTAVOS_CAIXA)
        throw new Error("Saldo acima do limite permitido.");
      if (
        atualizar((draft) => {
          const outros = (draft.saldosCaixa ?? []).filter(
            (saldo) =>
              saldo.restaurante_id !== abertura.id || saldo.competencia !== mes,
          );
          draft.saldosCaixa = [
            ...outros,
            { restaurante_id: abertura.id, competencia: mes, saldoCentavos },
          ];
        }, "Saldo de abertura salvo.")
      )
        setAbertura(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <div className="fluxo-caixa">
      <Panel
        title="Resumo de caixa"
        subtitle="As entradas e saídas seguem a data do recebimento ou pagamento."
      >
        <dl className="caixa-indicadores">
          <IndicadorCaixa
            titulo="Saldo de abertura"
            valor={caixa.saldoInicial}
          />
          <IndicadorCaixa
            titulo="Saldo realizado"
            valor={caixa.saldoRealizado}
          />
          <IndicadorCaixa
            titulo="Saldo projetado no fim do mês"
            valor={caixa.saldoProjetado}
            destaque
          />
        </dl>
        <div className="caixa-totais">
          <p>
            <strong>Realizado</strong> {dinheiro(caixa.realizados.entrada)} em
            entradas · {dinheiro(caixa.realizados.saida)} em saídas
          </p>
          <p>
            <strong>A receber e a pagar</strong>{" "}
            {dinheiro(caixa.previstos.entrada)} em entradas ·{" "}
            {dinheiro(caixa.previstos.saida)} em saídas
          </p>
        </div>
        {faltaSaldo.length > 0 && (
          <p className="notice warning caixa-aviso">
            Informe o saldo de abertura de{" "}
            {faltaSaldo.map((op) => op.nome).join(", ")} para calcular os
            saldos.
          </p>
        )}
        {caixa.vencidos > 0 && (
          <p className="notice warning caixa-aviso">
            {caixa.vencidos === 1
              ? "1 previsão com data vencida."
              : `${caixa.vencidos} previsões com data vencida.`}{" "}
            Atualize os lançamentos conforme os recebimentos e pagamentos.
          </p>
        )}
      </Panel>

      <Panel
        title="Saldos de abertura"
        subtitle="Informe o dinheiro disponível no primeiro dia da competência."
      >
        {lista.length === 0 && (
          <p className="muted">
            Cadastre uma operação para lançar seus saldos.
          </p>
        )}
        <ul className="caixa-saldos">
          {lista.map((op) => {
            const saldo = caixa.abertura.get(op.id);
            return (
              <li key={op.id}>
                <span>
                  <Wallet size={19} aria-hidden="true" /> {op.nome}
                </span>
                <strong>
                  {saldo === undefined ? "Em aberto" : dinheiro(saldo)}
                </strong>
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setErro("");
                    setAbertura(op);
                  }}
                >
                  {saldo === undefined ? "Informar saldo" : "Ajustar saldo"}
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel
        title="Movimentações"
        subtitle="Lance repasses, recebimentos de cartão, pagamentos a fornecedores, folha e outras contas."
        action={
          lista.length > 0 ? (
            <AddButton onClick={() => setEditar("novo")}>
              Novo lançamento
            </AddButton>
          ) : undefined
        }
      >
        {consolidado && (
          <p className="caixa-instrucao">
            Registre cada conta compartilhada uma vez, na operação que paga ou
            recebe.
          </p>
        )}
        {caixa.lancamentos.length > 0 && (
          <label className="field caixa-filtro">
            <span>Exibir</span>
            <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
              <option value="todos">Todos os lançamentos</option>
              <option value="a-pagar">Contas a pagar</option>
              <option value="previsto">Previstos</option>
              <option value="realizado">Realizados</option>
            </select>
          </label>
        )}
        {movimentos.length === 0 ? (
          <p className="muted">
            {caixa.lancamentos.length
              ? "Nenhum lançamento neste filtro."
              : "Nenhum lançamento nesta competência. Adicione uma entrada ou saída para acompanhar o caixa."}
          </p>
        ) : (
          <ul className="caixa-lancamentos">
            {movimentos.map((m) => {
              const Icone = m.tipo === "entrada" ? ArrowDownLeft : ArrowUpRight;
              const vencido = m.situacao === "previsto" && m.data < hoje;
              return (
                <li key={m.id}>
                  <Icone
                    size={20}
                    className={`caixa-icone ${m.tipo}`}
                    aria-hidden="true"
                  />
                  <div className="caixa-lancamento-nome">
                    <strong>{m.descricao}</strong>
                    <span>
                      {dataBR(m.data)} · {m.categoria}
                      {m.compra_id ? " · Compra" : ""}
                      {consolidado ? ` · ${nomes.get(m.restaurante_id)}` : ""}
                    </span>
                  </div>
                  <span
                    className={`caixa-situacao ${vencido ? "vencido" : m.situacao}`}
                  >
                    {m.compra_id
                      ? vencido
                        ? "A pagar · vencida"
                        : m.situacao === "previsto" ? "A pagar" : "Pago"
                      : vencido
                        ? "Previsto · vencido"
                        : m.situacao === "previsto" ? "Previsto" : "Realizado"}
                  </span>
                  <strong className="caixa-valor">
                    {m.tipo === "saida" ? "−" : "+"}
                    {dinheiro(m.valorCentavos)}
                  </strong>
                  <button
                    type="button"
                    className="button"
                    aria-label={`Editar ${m.descricao}`}
                    onClick={() => setEditar(m)}
                  >
                    Editar
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {previsoesAnteriores.length > 0 && (
          <details className="caixa-calendario">
            <summary>
              Previsões em aberto de meses anteriores (
              {previsoesAnteriores.length})
            </summary>
            <p className="caixa-instrucao">
              Atualize a data desses lançamentos para incluí-los no cálculo
              desta competência.
            </p>
            <ul className="caixa-saldos">
              {previsoesAnteriores.map((m) => (
                <li key={m.id}>
                  <div className="caixa-lancamento-nome">
                    <strong>{m.descricao}</strong>
                    <span>
                      {dataBR(m.data)} · {nomes.get(m.restaurante_id)}
                    </span>
                  </div>
                  <strong>
                    {m.tipo === "saida" ? "−" : "+"}
                    {dinheiro(m.valorCentavos)}
                  </strong>
                  <button
                    type="button"
                    className="button"
                    onClick={() => setEditar(m)}
                  >
                    Atualizar data
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Panel>

      <Panel
        title="Calendário de caixa"
        subtitle="A projeção considera todos os lançamentos nas datas informadas."
      >
        {diasSeguintes.length > 0 && (
          <div className="caixa-proximos">
            <div>
              <CalendarDays size={18} aria-hidden="true" /> Próximos dias na
              competência
            </div>
            <dl>
              {diasSeguintes.map((dia) => (
                <div key={dia.data}>
                  <dt>{dataBR(dia.data).slice(0, 5)}</dt>
                  <dd
                    className={
                      dia.saldoProjetado !== null && dia.saldoProjetado < 0
                        ? "negative"
                        : undefined
                    }
                  >
                    {saldoBR(dia.saldoProjetado)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        <details className="caixa-calendario">
          <summary>Ver saldos de todos os dias</summary>
          <div className="caixa-tabela">
            <table>
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col">Saldo realizado</th>
                  <th scope="col">Saldo projetado</th>
                </tr>
              </thead>
              <tbody>
                {caixa.dias.map((dia) => (
                  <tr key={dia.data}>
                    <th scope="row">{dataBR(dia.data)}</th>
                    <td
                      className={
                        dia.saldoRealizado !== null && dia.saldoRealizado < 0
                          ? "negative"
                          : undefined
                      }
                    >
                      {saldoBR(dia.saldoRealizado)}
                    </td>
                    <td
                      className={
                        dia.saldoProjetado !== null && dia.saldoProjetado < 0
                          ? "negative"
                          : undefined
                      }
                    >
                      {saldoBR(dia.saldoProjetado)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Panel>

      {abertura && (
        <Modal
          title={`Saldo de abertura · ${abertura.nome}`}
          close={() => setAbertura(null)}
        >
          <form onSubmit={salvarAbertura}>
            <Field
              label="Valor (R$)"
              hint="Use um valor negativo se o caixa iniciou no vermelho."
            >
              <Numeric
                moeda
                name="saldo"
                required
                defaultValue={
                  caixa.abertura.has(abertura.id)
                    ? caixa.abertura.get(abertura.id)! / 100
                    : ""
                }
                min={-limiteReais}
                max={limiteReais}
                placeholder="0,00"
              />
            </Field>
            {erro && (
              <p role="alert" className="notice warning">
                {erro}
              </p>
            )}
            <div className="form-actions">
              <button
                className="button"
                type="button"
                onClick={() => setAbertura(null)}
              >
                Cancelar
              </button>
              <button className="button primary">Salvar saldo</button>
            </div>
          </form>
        </Modal>
      )}
      {editar && (
        <MovimentoEditor
          operacoes={lista}
          mes={mes}
          hoje={hoje}
          movimento={editar === "novo" ? undefined : editar}
          fechar={() => setEditar(null)}
        />
      )}
    </div>
  );
}

function MovimentoEditor({
  operacoes,
  mes,
  hoje,
  movimento,
  fechar,
}: {
  operacoes: Restaurante[];
  mes: string;
  hoje: string;
  movimento?: MovimentoCaixa;
  fechar: () => void;
}) {
  const { atualizar } = useSistema();
  const compra = movimento?.compra_id ? movimento : undefined;
  const [tipo, setTipo] = useState<TipoCaixa>(movimento?.tipo ?? "entrada");
  const [situacao, setSituacao] = useState<SituacaoCaixa>(
    movimento?.situacao ?? "previsto",
  );
  const [erro, setErro] = useState("");
  const primeiroDia = mes + "-01";
  const ultimoDia = ultimoDiaCaixa(mes);
  const ultimoRealizado = hoje < ultimoDia ? hoje : ultimoDia;

  function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = new FormData(evento.currentTarget);
    try {
      const operacao = compra?.restaurante_id ?? formString(form, "operacao");
      const descricao = formString(form, "descricao");
      const data = formString(form, "data");
      const categoria = compra?.categoria ?? formString(form, "categoria") as CategoriaCaixa;
      const valorCentavos = paraCentavos(formString(form, "valor"));
      if (!operacoes.some((op) => op.id === operacao))
        throw new Error("Selecione uma operação.");
      if (!descricao) throw new Error("Informe a descrição do lançamento.");
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(data) ||
        (!movimento && (data < primeiroDia || data > ultimoDia))
      ) {
        throw new Error(
          movimento
            ? "Escolha uma data válida."
            : "Escolha uma data desta competência.",
        );
      }
      if (situacao === "realizado" && data > hoje)
        throw new Error("Para uma data futura, use a situação Previsto.");
      const tipoLancamento = compra?.tipo ?? tipo;
      if (!categoriasCaixa[tipoLancamento].some((opcao) => opcao === categoria))
        throw new Error("Selecione uma categoria.");
      if (valorCentavos <= 0 || valorCentavos > LIMITE_CENTAVOS_CAIXA)
        throw new Error("Informe um valor positivo dentro do limite.");
      const registro: MovimentoCaixa = {
        id: movimento?.id ?? crypto.randomUUID(),
        restaurante_id: operacao,
        descricao,
        data,
        categoria,
        valorCentavos,
        tipo: tipoLancamento,
        situacao,
        ...(compra && {
          compra_id: compra.compra_id,
          vencimento: situacao === "previsto" ? data : compra.vencimento,
        }),
      };
      if (
        atualizar(
          (draft) => {
            if (compra) {
              const atual = draft.movimentosCaixa?.find((item) => item.id === compra.id);
              if (!atual) throw new Error("O lançamento da compra foi alterado. Abra-o novamente.");
              if (atual.situacao === "realizado" && situacao === "previsto")
                throw new Error("Esta conta já foi paga.");
              if (situacao === "realizado") registro.vencimento = atual.vencimento;
            }
            draft.movimentosCaixa = movimento
              ? (draft.movimentosCaixa ?? []).map((item) =>
                  item.id === movimento.id ? registro : item,
                )
              : [...(draft.movimentosCaixa ?? []), registro];
          },
          data.startsWith(mes)
            ? "Lançamento salvo."
            : `Lançamento salvo em ${data.slice(0, 7).split("-").reverse().join("/")}.`,
        )
      )
        fechar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <Modal
      title={movimento ? "Editar lançamento" : "Novo lançamento"}
      close={fechar}
    >
      <form onSubmit={salvar}>
        <div className="form-grid">
          <Field label="Operação">
            <select name="operacao" defaultValue={movimento?.restaurante_id} disabled={!!compra}>
              {operacoes.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.nome}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tipo">
            <select
              value={tipo}
              disabled={!!compra}
              onChange={(e) => setTipo(e.target.value as TipoCaixa)}
            >
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
            </select>
          </Field>
          <Field label="Categoria">
            <select
              key={tipo}
              name="categoria"
              required
              disabled={!!compra}
              defaultValue={tipo === movimento?.tipo ? movimento.categoria : ""}
            >
              <option value="">Selecione a categoria</option>
              {categoriasCaixa[tipo].map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Situação">
            <select
              value={situacao}
              onChange={(e) => setSituacao(e.target.value as SituacaoCaixa)}
            >
              <option value="previsto" disabled={compra?.situacao === "realizado"}>Previsto</option>
              <option
                value="realizado"
                disabled={!movimento && hoje < primeiroDia}
              >
                {compra ? "Pago" : "Realizado"}
              </option>
            </select>
          </Field>
          <Field
            label={compra
              ? situacao === "previsto" ? "Vencimento" : "Data de pagamento"
              : situacao === "previsto" ? "Data prevista" : "Data efetiva"}
            hint={movimento ? "A competência acompanha a data." : undefined}
          >
            <input
              type="date"
              name="data"
              required
              min={movimento ? undefined : primeiroDia}
              max={
                movimento
                  ? situacao === "realizado"
                    ? hoje
                    : undefined
                  : situacao === "realizado"
                    ? ultimoRealizado
                    : ultimoDia
              }
              defaultValue={
                movimento?.data ?? (hoje.startsWith(mes) ? hoje : primeiroDia)
              }
            />
          </Field>
          <Field label="Valor (R$)">
            <Numeric
              moeda
              name="valor"
              required
              min={0.01}
              max={limiteReais}
              placeholder="0,00"
              defaultValue={movimento ? movimento.valorCentavos / 100 : ""}
            />
          </Field>
        </div>
        <Field label="Descrição">
          <input
            name="descricao"
            required
            maxLength={180}
            defaultValue={movimento?.descricao}
          />
        </Field>
        {erro && (
          <p role="alert" className="notice warning">
            {erro}
          </p>
        )}
        <div className="form-actions">
          {movimento && (!compra || movimento.situacao === "previsto") && (
            <button
              className="button"
              type="button"
              onClick={async () => {
                if (
                  (await confirmarExclusao(movimento.descricao)) &&
                  atualizar((draft) => {
                    if (compra?.compra_id)
                      alterarVencimentoCompra(draft, compra.compra_id);
                    else
                      draft.movimentosCaixa = (
                        draft.movimentosCaixa ?? []
                      ).filter((item) => item.id !== movimento.id);
                  }, "Lançamento excluído.")
                )
                  fechar();
              }}
            >
              Excluir
            </button>
          )}
          <button className="button" type="button" onClick={fechar}>
            Cancelar
          </button>
          <button className="button primary">Salvar lançamento</button>
        </div>
      </form>
    </Modal>
  );
}
