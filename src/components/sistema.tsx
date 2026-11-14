"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  Building2,
  ChevronDown,
  CircleHelp,
  Dna,
  FlaskConical,
  LayoutDashboard,
  Menu,
  NotebookPen,
  Store,
  TrendingUp,
  X,
  ShieldCheck,
} from "lucide-react";
import type { Database } from "@/lib/types";
import { repositorio, validarBackup } from "@/lib/storage";
import { competenciaAtual, novosCanais, novoDNA } from "@/lib/storage/seed";
import { Context, type Page } from "./context";
import { Overview, DNAEditor } from "./dna";
import { Canais, Restaurantes } from "./cadastros";
import { Insumos, Fichas } from "./producao";
import { Precos } from "./precos";
import { Modal } from "./ui";
const pages = [
  { id: "visao", label: "Visão geral", icon: LayoutDashboard },
  { id: "dna", label: "DNA mensal", icon: Dna },
  { id: "canais", label: "Canais de venda", icon: Store },
  { id: "insumos", label: "Insumos", icon: FlaskConical },
  { id: "fichas", label: "Fichas técnicas", icon: NotebookPen },
  { id: "precos", label: "Precificação", icon: TrendingUp },
  { id: "restaurantes", label: "Restaurantes", icon: Building2 },
] as const;
const descriptions: Record<Page, string> = {
  visao: "Uma visão clara dos números. Um próximo passo mais seguro.",
  dna: "Transforme a realidade do seu restaurante em uma base para precificar.",
  canais: "Cada canal tem seus custos. Seu preço precisa acompanhar.",
  insumos: "Custos atualizados na origem, fichas sempre em dia.",
  fichas: "Cada ingrediente conta. Conheça o custo real de cada porção.",
  precos: "Do custo à margem: encontre o preço que faz sentido.",
  restaurantes: "Cada operação com seus números, seu DNA e suas decisões.",
};
function preparar(db: Database, id: string, mes: string) {
  if (!db.dnas.some((d) => d.restaurante_id === id && d.competencia === mes))
    db.dnas.push(novoDNA(id, mes));
  if (!db.canais.some((c) => c.restaurante_id === id && c.competencia === mes))
    db.canais.push(...novosCanais(id, mes));
  return db;
}
export default function Sistema() {
  const [db, setDb] = useState<Database | null>(null),
    [id, setId] = useState(""),
    [mes, setMes] = useState(competenciaAtual),
    [page, setPage] = useState<Page>("visao"),
    [menu, setMenu] = useState(false),
    [message, setMessage] = useState(""),
    [erro, setErro] = useState(""),
    [backup, setBackup] = useState<Database | null>(null),
    [help, setHelp] = useState(false),
    [revisao, setRevisao] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const atual = useRef<Database | null>(null);
  useEffect(() => {
    try {
      const data = repositorio.carregar(),
        first = data.restaurantes[0].id;
      preparar(data, first, competenciaAtual());
      repositorio.salvar(data);
      atual.current = data;
      setDb(data);
      setId(first);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [message]);
  function atualizar(
    change: (draft: Database) => void,
    mensagem = "Alterações salvas neste navegador.",
  ) {
    if (!atual.current) return false;
    try {
      const draft = structuredClone(atual.current);
      change(draft);
      repositorio.salvar(draft);
      atual.current = draft;
      setDb(draft);
      setMessage(mensagem);
      return true;
    } catch (e) {
      setMessage((e as Error).message);
      return false;
    }
  }
  function selecionar(next: string, month = mes) {
    if (!atual.current || !month) return;
    if (
      atualizar((draft) => {
        preparar(draft, next, month);
      }, "Competência selecionada.")
    ) {
      setId(next);
      setMes(month);
    }
  }
  function exportar() {
    try {
      const blob = new Blob([repositorio.exportar()], {
          type: "application/json",
        }),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `dna-restaurantes-${competenciaAtual()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Backup exportado com todos os restaurantes.");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function importar(file?: File) {
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("O backup deve ter até 10 MB.");
      setBackup(validarBackup(JSON.parse(await file.text())));
    } catch (e) {
      setMessage(`Não foi possível importar: ${(e as Error).message}`);
    }
    if (input.current) input.current.value = "";
  }
  function confirmarImportacao() {
    if (!backup) return;
    try {
      const data = preparar(
        structuredClone(backup),
        backup.restaurantes[0].id,
        mes,
      );
      repositorio.importar(JSON.stringify(data));
      atual.current = data;
      setDb(data);
      setId(data.restaurantes[0].id);
      setErro("");
      setRevisao((r) => r + 1);
      setBackup(null);
      setMessage("Backup importado com sucesso.");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  const upload = (
    <input
      ref={input}
      type="file"
      accept="application/json,.json"
      className="sr-only"
      aria-label="Selecionar backup JSON"
      onChange={(e) => void importar(e.target.files?.[0])}
    />
  );
  if (!db)
    return (
      <main className="loading">
        <div className="brand-symbol">
          <Dna />
        </div>
        <h1>DNA restaurante</h1>
        <p>{erro || "Preparando seu espaço de gestão…"}</p>
        {erro && (
          <button
            className="button primary"
            onClick={() => input.current?.click()}
          >
            Importar backup
          </button>
        )}
        {upload}
        {backup && (
          <Modal title="Restaurar backup" close={() => setBackup(null)}>
            <p>
              Restaurar {backup.restaurantes.length} restaurante(s)? Os dados
              locais serão substituídos.
            </p>
            <button className="button primary" onClick={confirmarImportacao}>
              Restaurar dados
            </button>
          </Modal>
        )}
        {message && <p role="alert">{message}</p>}
      </main>
    );
  const restaurante =
      db.restaurantes.find((r) => r.id === id) ?? db.restaurantes[0],
    dna = db.dnas.find(
      (d) => d.restaurante_id === restaurante.id && d.competencia === mes,
    )!;
  const ir = (p: Page) => {
    setPage(p);
    setMenu(false);
  };
  return (
    <Context.Provider
      value={{
        db,
        restaurante,
        mes,
        dna,
        atualizar,
        ir,
        avisar: setMessage,
        selecionar,
      }}
    >
      <a href="#conteudo" className="skip">
        Pular para o conteúdo
      </a>
      <div className="app-shell">
        {menu && (
          <button
            aria-label="Fechar menu"
            className="menu-backdrop"
            onClick={() => setMenu(false)}
          />
        )}
        <aside className={`sidebar ${menu ? "opened" : ""}`}>
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              ir("visao");
            }}
          >
            <span className="brand-symbol">
              <Dna size={25} />
            </span>
            <span>
              dna<span className="brand-dot">.</span>
              <small>RESTAURANTE</small>
            </span>
          </a>
          <button
            className="mobile-close icon-button"
            aria-label="Fechar menu"
            onClick={() => setMenu(false)}
          >
            <X />
          </button>
          <div className="restaurant-switch">
            <span className="restaurant-avatar">
              {restaurante.nome.charAt(0)}
            </span>
            <label>
              <small>SEU RESTAURANTE</small>
              <select
                aria-label="Restaurante ativo"
                value={restaurante.id}
                onChange={(e) => selecionar(e.target.value)}
              >
                {db.restaurantes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nome}
                  </option>
                ))}
              </select>
            </label>
            <ChevronDown size={15} />
          </div>
          <div className="nav-caption">GESTÃO DO RESTAURANTE</div>
          <nav aria-label="Menu principal">
            {pages.map((p) => (
              <button
                key={p.id}
                onClick={() => ir(p.id)}
                className={`nav-item ${page === p.id ? "active" : ""}`}
              >
                <p.icon size={19} />
                <span>{p.label}</span>
                {page === p.id && <span className="nav-dot" />}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="local-note">
              <ShieldCheck size={20} />
              <div>
                <strong>Seus dados, com você</strong>
                <small>
                  Salvos neste navegador.
                  <br />
                  Exporte backups regularmente.
                </small>
              </div>
            </div>
            <button className="nav-item" onClick={() => setHelp(true)}>
              <CircleHelp size={18} />
              Entenda o DNA
              <ArrowUpRight size={16} />
            </button>
            <div className="sidebar-foot">
              FEITO PARA QUEM EMPREENDE <span>v1.0</span>
            </div>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-button menu-toggle"
                aria-label="Abrir menu"
                onClick={() => setMenu(true)}
              >
                <Menu />
              </button>
              <span>Meu restaurante</span>
              <span className="crumb-slash">/</span>
              <strong>{pages.find((p) => p.id === page)?.label}</strong>
            </div>
            <div className="top-actions">
              <button className="button ghost" onClick={exportar}>
                <ArrowDownToLine size={16} />
                <span>Exportar backup</span>
              </button>
              <button
                className="button ghost"
                onClick={() => input.current?.click()}
              >
                <ArrowUpFromLine size={16} />
                <span>Importar</span>
              </button>
              <span className="profile">{restaurante.nome.charAt(0)}</span>
            </div>
          </header>
          <main id="conteudo">
            <div className="page-heading">
              <div>
                <div className="eyebrow">NÚMEROS QUE GUIAM DECISÕES</div>
                <h1>
                  {pages.find((p) => p.id === page)?.label}
                  <span className="heading-dot">.</span>
                </h1>
                <p>{descriptions[page]}</p>
              </div>
              <label className="month-select">
                <span>COMPETÊNCIA</span>
                <input
                  type="month"
                  aria-label="Competência mensal"
                  value={mes}
                  min="2000-01"
                  max="2100-12"
                  onChange={(e) => {
                    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value))
                      selecionar(id, e.target.value);
                  }}
                />
              </label>
            </div>
            <div
              key={`${id}:${mes}:${page}:${revisao}`}
              className="page-content"
            >
              {page === "visao" ? (
                <Overview />
              ) : page === "dna" ? (
                <DNAEditor />
              ) : page === "canais" ? (
                <Canais />
              ) : page === "insumos" ? (
                <Insumos />
              ) : page === "fichas" ? (
                <Fichas />
              ) : page === "precos" ? (
                <Precos />
              ) : (
                <Restaurantes />
              )}
            </div>
            <footer className="main-footer">
              <span>
                <span className="status-dot" /> Armazenamento local · sem
                sincronização entre dispositivos
              </span>
              <span>Clareza nos custos. Saúde no negócio.</span>
            </footer>
          </main>
        </div>
      </div>
      {upload}
      {message && (
        <div className="toast" role="status">
          <span>{message}</span>
          <button
            className="icon-button"
            aria-label="Dispensar aviso"
            onClick={() => setMessage("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {backup && (
        <Modal title="Importar backup" close={() => setBackup(null)}>
          <div className="notice warning">
            Esta ação substituirá todos os dados deste navegador, de todos os
            restaurantes. Exporte o backup atual antes de continuar.
          </div>
          <p className="modal-copy">
            O arquivo contém {backup.restaurantes.length} restaurante(s),{" "}
            {backup.dnas.length} DNA(s) mensais, {backup.insumos.length}{" "}
            insumo(s) e {backup.produtos.length} ficha(s).
          </p>
          <div className="form-actions">
            <button className="button" onClick={() => setBackup(null)}>
              Cancelar
            </button>
            <button className="button primary" onClick={confirmarImportacao}>
              Substituir e importar
            </button>
          </div>
        </Modal>
      )}
      {help && (
        <Modal title="Como o DNA funciona" close={() => setHelp(false)}>
          <div className="help-content">
            <p>
              O DNA reúne o faturamento, as despesas operacionais, os impostos e
              a margem desejada de cada restaurante em cada mês.
            </p>
            <h3>O caminho até o preço</h3>
            <ol>
              <li>Cadastre o DNA mensal e as taxas de cada canal.</li>
              <li>Informe os insumos e monte as fichas técnicas.</li>
              <li>Compare o preço mínimo com seu preço praticado.</li>
            </ol>
            <p>
              O preço reserva uma parte para cada despesa e para a meta de
              lucro. A margem é gerencial sobre o faturamento bruto; não
              substitui uma apuração contábil.
            </p>
            <p>
              Amortização de dívida e despesas de natureza “outro” não entram
              nos fixos operacionais. A embalagem do canal substitui a embalagem
              base da ficha; nunca é somada duas vezes.
            </p>
            <p>
              Taxas de canal e preços praticados são específicos da competência.
              Insumos usam o preço atual e atualizam as fichas, inclusive ao
              consultar meses anteriores.
            </p>
          </div>
        </Modal>
      )}
    </Context.Provider>
  );
}
