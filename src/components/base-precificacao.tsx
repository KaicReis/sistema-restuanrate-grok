"use client";

import { useState } from "react";
import { dinheiro, paraCentavos } from "@/lib/dna";
import { competenciaAtual } from "@/lib/storage/seed";
import { basePrecificacaoSchema, sugerirBasePrecificacao, type BasePrecificacao as Registro } from "@/lib/base-precificacao";
import { useSistema } from "./context";
import { Field, Modal, Panel } from "./ui";
import { Numeric } from "./numeric";

const formatoMes = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" });
const exibirMes = (mes: string) => formatoMes.format(new Date(`${mes}-01T12:00:00Z`));
const fontes = {
  anotai: "Realizado do Anotaí",
  dre: "Realizado do DRE",
  dna: "Realizado informado no DNA",
  estimativa: "Estimativa por setor",
  estimativa_cobertura: "Estimativa sem cobertura integral do salão comprovada",
  substituido: "Substituído pelo menor mês",
};

function Memoria({ base }: { base: Pick<Extract<Registro, { modo: "media" }>, "meses" | "menorMes"> }) {
  const menores = base.meses.find(({ competencia }) => competencia === base.menorMes);
  const substituidos = base.meses.filter(({ fonte }) => fonte === "substituido").length;
  const fim = base.meses.at(-1);
  const coberturaLimitada = base.meses.some(({ fonte }) => fonte === "estimativa_cobertura");
  return (
    <details style={{ marginBlock: 8 }}>
      <summary>{base.meses.length} meses no cálculo · {substituidos} preenchidos pelo menor mês</summary>
      {fim && <p>Meses encerrados até {exibirMes(fim.competencia)}.</p>}
      {coberturaLimitada && <p>Algumas estimativas não têm cobertura integral do salão comprovada. Use-as apenas para planejamento.</p>}
      {menores && <p>Menor mês usado: {exibirMes(menores.competencia)}, {dinheiro(menores.valor)} ({fontes[menores.fonte]}).</p>}
      <ul>
        {base.meses.map(({ competencia, fonte, valor }) =>
          <li key={competencia}>{exibirMes(competencia)} · {dinheiro(valor)} · {fontes[fonte]}</li>,
        )}
      </ul>
    </details>
  );
}

export function BasePrecificacao() {
  const { db, restaurante, dna, atualizar } = useSistema();
  const atual = competenciaAtual();
  const anoAtual = Number(atual.slice(0, 4));
  const salva = db.basesPrecificacao?.find(({ restaurante_id }) => restaurante_id === restaurante.id);
  const [ano, setAno] = useState(String(salva?.modo === "media" ? salva.ano : anoAtual));
  const [manual, setManual] = useState("");
  const [pendente, setPendente] = useState<Registro | null>(null);
  const novo = sugerirBasePrecificacao(db, restaurante.id, Number(ano), atual);
  let valorManual = 0;
  try { valorManual = paraCentavos(manual); } catch { /* entrada incompleta ou inválida */ }
  const registroManual = basePrecificacaoSchema.safeParse({
    restaurante_id: restaurante.id, modo: "manual", valor: valorManual,
  });
  const valorAtivo = salva && salva.modo !== "mensal" ? salva.valor : dna.faturamento;
  function confirmar() {
    if (!pendente) return;
    const salvou = atualizar((draft) => {
      draft.basesPrecificacao = [
        ...(draft.basesPrecificacao ?? []).filter(({ restaurante_id }) => restaurante_id !== restaurante.id),
        pendente,
      ];
    }, "Base de precificação atualizada.");
    if (salvou) setPendente(null);
  }
  return (
    <Panel title="Base de faturamento para precificação" subtitle={`${restaurante.nome} · Altera apenas o preço sugerido e a margem projetada.`}>
      <p><strong>{valorAtivo > 0 ? dinheiro(valorAtivo) : "Não informado"}</strong> · {
        salva?.modo === "media" ? `Média de ${salva.ano} fixada` :
        salva?.modo === "manual" ? "Valor mensal fixo informado" : "Referência do DNA do mês"
      }</p>
      <p className="muted">O custo da ficha, o histórico de vendas, o DRE e o rateio do aluguel não mudam.</p>
      {salva?.modo === "media" && <Memoria base={salva} />}
      <details>
        <summary>Calcular média ou substituir a base</summary>
        <Field label="Ano do histórico">
          <input type="number" min="2000" max={anoAtual} step="1" value={ano} onChange={(e) => setAno(e.target.value)} />
        </Field>
        <p>Considera apenas meses encerrados. Quando não há realizado completo, usa a estimativa completa do setor. Meses sem um valor completo recebem o menor mês disponível desse mesmo ano e setor.</p>
        {novo ? (
          <>
            <p>Média sugerida: <strong>{dinheiro(novo.valor)}</strong></p>
            <Memoria base={novo} />
            {novo.valor === 0 ? <p>Uma base de R$ 0 não permite precificar. Escolha outro ano ou informe um valor manual.</p> :
              <button type="button" className="button primary" onClick={() =>
                setPendente({ ...novo, modo: "media", restaurante_id: restaurante.id })}>
                Fixar média para precificação
              </button>}
          </>
        ) : <p>Sem meses completos com dados deste setor no ano selecionado. Nada foi alterado.</p>}
        <Field label="Ou informe um valor mensal fixo (R$)">
          <Numeric moeda value={manual} min="0.01" step="0.01" onChange={(event) => setManual(event.target.value)} />
        </Field>
        <button type="button" className="button" disabled={!registroManual.success} onClick={() =>
          registroManual.success && setPendente(registroManual.data)}>
          Fixar valor manual
        </button>
        {salva && salva.modo !== "mensal" && (
          <button type="button" className="button" onClick={() =>
            setPendente({ modo: "mensal", restaurante_id: restaurante.id })}>
            Voltar à referência mensal do DNA
          </button>
        )}
      </details>
      {pendente && (
        <Modal title="Confirmar base de precificação" close={() => setPendente(null)}>
          <p>{pendente.modo === "mensal" ? "Voltar a usar a referência do DNA de cada mês para" :
            `Usar ${dinheiro(pendente.valor)} como base mensal fixa para`} <strong>{restaurante.nome}</strong>?</p>
          <p>Vendas anteriores, DRE, rateio e custo de ingredientes não serão alterados.</p>
          <div className="form-actions">
            <button type="button" className="button" onClick={() => setPendente(null)}>Cancelar</button>
            <button type="button" className="button primary" onClick={confirmar}>Confirmar base</button>
          </div>
        </Modal>
      )}
    </Panel>
  );
}
