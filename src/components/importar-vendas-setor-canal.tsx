"use client";

import { useRef, useState, type FormEvent } from "react";
import { Upload } from "lucide-react";
import { operacoes } from "@/lib/v2";
import { importarVendasSetorCanal, LIMITE_CSV_VENDAS } from "@/lib/vendas-setor-canal";
import { useSistema } from "./context";
import { Field, Modal } from "./ui";

const modelosItens = "data:text/csv;charset=utf-8,pedido%3Bdata%3Bsetor%3Bvalor_liquido%0D%0A";
const mesBR = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

function arquivoCsv(formulario: FormData, campo: string, nome: string) {
  const arquivo = formulario.get(campo);
  if (!(arquivo instanceof File) || !arquivo.size) throw new Error(`Selecione o CSV de ${nome}.`);
  if (arquivo.size > LIMITE_CSV_VENDAS) throw new Error(`O CSV de ${nome} excede 10 MB.`);
  return arquivo;
}

export function ImportarVendasSetorCanal({ competencia }: { competencia: string }) {
  const { db, atualizar } = useSistema();
  const [aberto, setAberto] = useState(false);
  const [importando, setImportando] = useState(false);
  const [erro, setErro] = useState("");
  const tentativa = useRef<symbol | null>(null);
  const temReferencia = db.vendasAnotai?.some((venda) => venda.competencia === competencia);
  const temMatriz = db.vendasSetorCanal?.some((venda) => venda.competencia === competencia);
  if (!temReferencia) return null;

  function fechar() {
    tentativa.current = null;
    setAberto(false);
    setImportando(false);
    setErro("");
  }

  async function importar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const atual = Symbol();
    tentativa.current = atual;
    setImportando(true);
    setErro("");
    try {
      const formulario = new FormData(evento.currentTarget);
      const pedidos = arquivoCsv(formulario, "pedidos", "pedidos");
      const itens = arquivoCsv(formulario, "itens", "itens");
      const [pedidosCsv, itensCsv] = await Promise.all([pedidos.text(), itens.text()]);
      if (tentativa.current !== atual) return;
      let erroDados = "";
      const salvo = atualizar((draft) => {
        try {
          const referencia = draft.vendasAnotai?.find((venda) => venda.competencia === competencia);
          if (!referencia) throw new Error("Os totais do Anotaí deixaram de estar disponíveis para esse mês.");
          const matriz = importarVendasSetorCanal({ pedidosCsv, itensCsv, setores: operacoes(draft), referencia });
          draft.vendasSetorCanal = [
            ...(draft.vendasSetorCanal ?? []).filter((venda) => venda.competencia !== competencia),
            matriz,
          ];
        } catch (falha) {
          erroDados = (falha as Error).message;
          throw falha;
        }
      }, "Faturamento por setor e canal importado.");
      if (salvo) fechar();
      else setErro(erroDados || "Não foi possível salvar a matriz.");
    } catch (falha) {
      if (tentativa.current === atual) setErro((falha as Error).message);
    } finally {
      if (tentativa.current === atual) {
        tentativa.current = null;
        setImportando(false);
      }
    }
  }

  return (
    <>
      <button type="button" className="button" onClick={() => setAberto(true)}>
        <Upload size={17} aria-hidden="true" /> {temMatriz ? "Atualizar matriz por CSV" : "Importar pedidos e itens"}
      </button>
      {aberto && (
        <Modal title="Importar faturamento por setor e canal" close={fechar}>
          <form onSubmit={importar}>
            <p className="muted">Competência {mesBR.format(new Date(`${competencia}-01T12:00:00Z`))}.</p>
            <Field label="CSV de pedidos" hint="Use a exportação de Pedidos do Anotaí ou um CSV com pedido, data, canal e subtotal_sem_frete.">
              <input name="pedidos" type="file" accept=".csv,text/csv" required disabled={importando} />
            </Field>
            <Field label="CSV de itens" hint="Vincule cada item ao número e à data do pedido. Use o nome exato ou o ID do setor e o valor em reais, com os descontos já abatidos.">
              <input name="itens" type="file" accept=".csv,text/csv" required disabled={importando} />
            </Field>
            <p className="muted">Envie os dois arquivos do mesmo período, em UTF-8, com até 10 MB por arquivo. Use datas em DD/MM/AAAA ou AAAA-MM-DD.</p>
            <a className="button" href={modelosItens} download="modelo-itens-por-pedido.csv">Baixar modelo de itens</a>
            {erro && <p className="notice warning" role="alert">{erro}</p>}
            <div className="form-actions">
              <button type="button" className="button" onClick={fechar}>Cancelar</button>
              <button type="submit" className="button primary" disabled={importando}>
                {importando ? "Conferindo…" : temMatriz ? "Substituir matriz da competência" : "Conferir e importar"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
