"use client";

import { useState, type FormEvent } from "react";
import { cotarCombo, type Combo } from "@/lib/combos";
import { dinheiro, insumoDeEmbalagem, paraCentavos, percentual, unidadesFicha } from "@/lib/dna";
import { insumoArquivado } from "@/lib/insumos";
import { insumosMes } from "@/lib/v2";
import { useSistema } from "./context";
import { Numeric } from "./numeric";
import { AddButton, Empty, Field, Modal, Panel, confirmarExclusao, formString } from "./ui";

export function Combos() {
  const { db, mes, restaurante, atualizar } = useSistema();
  const [editor, setEditor] = useState<Combo | "novo" | null>(null);
  const combos = (db.combos ?? []).filter((c) => c.restaurante_id === restaurante.id);
  const canais = db.canais.filter((c) => c.restaurante_id === restaurante.id && c.competencia === mes);
  const produtos = db.produtos.filter((p) => p.restaurante_id === restaurante.id)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return (
    <>
      <div className="section-toolbar">
        <span>{combos.length} {combos.length === 1 ? "combo cadastrado" : "combos cadastrados"}</span>
        <AddButton onClick={() => setEditor("novo")}>Novo combo</AddButton>
      </div>
      {combos.length === 0 && <Empty title="Nenhum combo cadastrado" description="Junte produtos da operação e compare o preço com a margem para o canal escolhido." />}
      <div className="preparos-grid">
        {combos.map((combo) => {
          const canal = canais.find((c) => c.nome === combo.canal);
          let cotacao;
          let aviso;
          try {
            if (!canal) throw new Error("Cadastre este canal na competência selecionada.");
            cotacao = cotarCombo(db, combo, canal);
            if (!cotacao.minimo.viavel) aviso = cotacao.minimo.motivo;
          } catch (e) {
            aviso = (e as Error).message;
          }
          return (
            <article key={combo.id} className="preparo-card">
              <div className="preparo-card-heading">
                <div>
                  <h2>{combo.nome}</h2>
                  <span className="preparo-status is-ready">{combo.canal}</span>
                </div>
              </div>
              <p>{combo.itens.map((item) => `${item.quantidade}× ${produtos.find((p) => p.id === item.produto_id)?.nome ?? "Produto indisponível"}`).join(" · ")}</p>
              {combo.embalagens?.length ? (
                <p className="muted">{combo.embalagens.map((item) => `${item.quantidade}× ${db.insumos.find((i) => i.id === item.insumo_id)?.nome ?? "Embalagem indisponível"}`).join(" · ")}</p>
              ) : null}
              <dl className="preparo-metrics">
                <div><dt>Custo direto</dt><dd>{cotacao ? dinheiro(cotacao.custo) : "Pendente"}</dd></div>
                <div><dt>Preço mínimo</dt><dd>{cotacao?.minimo.viavel ? dinheiro(cotacao.minimo.precoMinimo) : "—"}</dd></div>
                <div><dt>Preço do combo</dt><dd>{combo.preco === undefined ? "—" : dinheiro(combo.preco)}</dd></div>
                <div><dt>Margem estimada</dt><dd>{cotacao?.margem ? percentual(cotacao.margem.margem) : "—"}</dd></div>
              </dl>
              {cotacao?.avulsos != null && <p className="muted">Itens vendidos separadamente neste canal · {dinheiro(cotacao.avulsos)}</p>}
              {aviso && <p className="muted">{aviso}</p>}
              <div className="preparo-card-footer">
                <button type="button" className="button" onClick={() => setEditor(combo)}>Editar combo</button>
              </div>
            </article>
          );
        })}
      </div>
      {editor && (
        <ComboEditor
          combo={editor === "novo" ? undefined : editor}
          fechar={() => setEditor(null)}
          produtos={produtos}
          canais={Array.from(new Set(canais.map((c) => c.nome)))}
          gravar={(combo) => {
            if (atualizar((draft) => {
              draft.combos = [...(draft.combos ?? []).filter((c) => c.id !== combo.id), combo];
            }, "Combo salvo na gestão.")) setEditor(null);
          }}
          excluir={async () => {
            if (editor === "novo" || !(await confirmarExclusao(editor.nome))) return;
            if (atualizar((draft) => {
              draft.combos = (draft.combos ?? []).filter((c) => c.id !== editor.id);
            }, "Combo excluído.")) setEditor(null);
          }}
        />
      )}
    </>
  );
}

function ComboEditor({ combo, produtos, canais, gravar, fechar, excluir }: {
  combo?: Combo;
  produtos: { id: string; nome: string }[];
  canais: string[];
  gravar: (combo: Combo) => void;
  fechar: () => void;
  excluir: () => void;
}) {
  const { db, mes, restaurante } = useSistema();
  const [itens, setItens] = useState(combo?.itens ?? [
    { produto_id: "", quantidade: 1 },
    { produto_id: "", quantidade: 1 },
  ]);
  const [embalagens, setEmbalagens] = useState(combo?.embalagens ?? []);
  const opcoesEmbalagem = insumosMes(db, mes)
    .filter((i) => i.restaurante_id === restaurante.id && insumoDeEmbalagem(i) && unidadesFicha(i).includes("un") &&
      (!insumoArquivado(i) || embalagens.some((item) => item.insumo_id === i.id)))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const [erro, setErro] = useState("");
  const alterar = (idx: number, patch: Partial<Combo["itens"][number]>) =>
    setItens((atuais) => atuais.map((item, i) => i === idx ? { ...item, ...patch } : item));

  function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    try {
      const form = new FormData(evento.currentTarget);
      const nome = formString(form, "nome").trim();
      const canal = formString(form, "canal");
      const preco = formString(form, "preco");
      const embalagem = formString(form, "embalagem");
      if (!nome || !canal) throw new Error("Informe o nome e o canal.");
      if (itens.reduce((total, item) => total + item.quantidade, 0) < 2 || itens.some((i) => !i.produto_id || !Number.isInteger(i.quantidade) || i.quantidade < 1 || i.quantidade > 100) ||
          new Set(itens.map((i) => i.produto_id)).size !== itens.length)
        throw new Error("Escolha os produtos e informe pelo menos duas unidades no total.");
      if (embalagens.some((item) => !opcoesEmbalagem.some((i) => i.id === item.insumo_id) ||
          !Number.isInteger(item.quantidade) || item.quantidade < 1 || item.quantidade > 100) ||
          new Set(embalagens.map((item) => item.insumo_id)).size !== embalagens.length)
        throw new Error("Escolha cada embalagem do combo e informe a quantidade em unidades.");
      gravar({
        id: combo?.id ?? crypto.randomUUID(), restaurante_id: restaurante.id, nome, canal, itens,
        ...(preco ? { preco: paraCentavos(preco) } : {}),
        ...(embalagem ? { embalagem: paraCentavos(embalagem) } : {}),
        ...(embalagens.length ? { embalagens } : {}),
      });
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <Modal title={combo ? "Editar combo" : "Novo combo"} close={fechar}>
      <form onSubmit={salvar}>
        <div className="form-grid">
          <Field label="Nome do combo"><input name="nome" required maxLength={120} defaultValue={combo?.nome} /></Field>
          <Field label="Canal">
            <select name="canal" required defaultValue={combo?.canal ?? canais[0] ?? ""}>
              <option value="">Selecione um canal</option>
              {combo && !canais.includes(combo.canal) && <option>{combo.canal}</option>}
              {canais.map((canal) => <option key={canal}>{canal}</option>)}
            </select>
          </Field>
          <Field label="Preço de venda (R$)"><Numeric moeda name="preco" min={0} defaultValue={combo?.preco === undefined ? "" : combo.preco / 100} /></Field>
          <Field label="Embalagem manual (R$)" hint="Use para informar o custo total em reais.">
            <Numeric moeda name="embalagem" disabled={embalagens.length > 0} min={0} defaultValue={combo?.embalagem === undefined ? "" : combo.embalagem / 100} />
          </Field>
        </div>
        <Panel title="Produtos do combo">
          {itens.map((item, idx) => (
            <div className="combo-item-row" key={idx}>
              <Field label="Produto">
                <select required value={item.produto_id} onChange={(e) => alterar(idx, { produto_id: e.target.value })}>
                  <option value="">Selecione um produto</option>
                  {produtos.filter((p) => p.id === item.produto_id || !itens.some((i) => i.produto_id === p.id)).map((p) => <option value={p.id} key={p.id}>{p.nome}</option>)}
                </select>
              </Field>
              <Field label="Quantidade">
                <input required type="number" min={1} max={100} value={item.quantidade || ""} onChange={(e) => alterar(idx, { quantidade: Number(e.target.value) })} />
              </Field>
              <button type="button" className="button" aria-label={`Remover produto ${idx + 1}`} disabled={itens.length <= 1} onClick={() => setItens(itens.filter((_, i) => i !== idx))}>Remover</button>
            </div>
          ))}
          <button type="button" className="button" disabled={itens.length >= 50} onClick={() => setItens([...itens, { produto_id: "", quantidade: 1 }])}>Adicionar produto</button>
        </Panel>
        <Panel title="Embalagens do combo">
          <p className="muted">As embalagens escolhidas aqui substituem as embalagens dos produtos. Sem seleção ou valor manual, o total vem das fichas e do canal.</p>
          {embalagens.map((item, idx) => (
            <div className="combo-item-row" key={idx}>
              <Field label="Embalagem">
                <select required value={item.insumo_id} onChange={(e) => setEmbalagens(embalagens.map((atual, i) =>
                  i === idx ? { ...atual, insumo_id: e.target.value } : atual,
                ))}>
                  <option value="">Selecione uma embalagem</option>
                  {opcoesEmbalagem.filter((opcao) => opcao.id === item.insumo_id || !embalagens.some((outra) => outra.insumo_id === opcao.id))
                    .map((opcao) => <option key={opcao.id} value={opcao.id}>{opcao.nome}</option>)}
                </select>
              </Field>
              <Field label="Quantidade (un)">
                <input required type="number" min={1} max={100} value={item.quantidade || ""} onChange={(e) => setEmbalagens(embalagens.map((atual, i) =>
                  i === idx ? { ...atual, quantidade: Number(e.target.value) } : atual,
                ))} />
              </Field>
              <button type="button" className="button" aria-label={`Remover embalagem ${idx + 1}`} onClick={() => setEmbalagens(embalagens.filter((_, i) => i !== idx))}>Remover</button>
            </div>
          ))}
          {opcoesEmbalagem.length > 0 ? (
            <button type="button" className="button" disabled={embalagens.length >= Math.min(50, opcoesEmbalagem.length)} onClick={() => setEmbalagens([...embalagens, { insumo_id: "", quantidade: 1 }])}>Adicionar embalagem</button>
          ) : <p className="muted">Cadastre as embalagens por unidade na tela Insumos.</p>}
        </Panel>
        {erro && <p className="notice warning" role="alert">{erro}</p>}
        <div className="form-actions">
          {combo && <button type="button" className="button danger" onClick={excluir}>Excluir combo</button>}
          <button type="button" className="button" onClick={fechar}>Cancelar</button>
          <button type="submit" className="button primary">Salvar combo</button>
        </div>
      </form>
    </Modal>
  );
}
