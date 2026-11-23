"use client";
import { CloudIndicator, useCloud } from "./cloud";
import { CapitalGiro } from "./capital";
import { Dre, PontoEquilibrio } from "./financeiro";
import { FluxoCaixa } from "./fluxo-caixa";
import { Compras } from "./compras";
import { mesclarDados } from "@/lib/import-data";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Building2,
  CalendarDays,
  CircleHelp,
  Dna,
  FlaskConical,
  LayoutDashboard,
  Menu,
  NotebookPen,
  Store,
  X,
  Wallet,
  ArrowRightLeft,
  ChartNoAxesCombined,
  ChartColumnIncreasing,
  Target,
  ShoppingCart,
  Settings2,
  CookingPot,
  Tags,
  Archive,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { Database } from "@/lib/types";
import { migrar } from "@/lib/storage/migrate";
import { repositorio, validarBackup } from "@/lib/storage";
import { competenciaAtual, novosCanais, novoDNA } from "@/lib/storage/seed";
import { Context, type Page } from "./context";
import { Overview, DNAEditor } from "./dna";
import { Canais, Restaurantes } from "./cadastros";
import { Vila } from "./vila";
import { Relatorios } from "./relatorios";
import { FaturamentoMatriz } from "./faturamento-matriz";
import { dnaComRateio } from "@/lib/v2";
import { Insumos, Fichas, Receitas } from "./producao";
import { Combos } from "./combos";
import { Precos } from "./precos";
import { Modal } from "./ui";
const pages = [
  { id: "relatorios", label: "Relatórios", icon: ChartColumnIncreasing },
  { id: "dre", label: "DRE gerencial", icon: ChartNoAxesCombined },
  { id: "equilibrio", label: "Ponto de equilíbrio", icon: Target },
  { id: "fluxo-caixa", label: "Fluxo de caixa", icon: ArrowRightLeft },
  { id: "capital", label: "Capital de giro", icon: Wallet },
  { id: "compras", label: "Compras", icon: ShoppingCart },
  { id: "visao", label: "Visão geral", icon: LayoutDashboard },
  { id: "dna", label: "DNA mensal", icon: Dna },
  { id: "canais", label: "Canais de venda", icon: Store },
  { id: "insumos", label: "Insumos", icon: FlaskConical },
  { id: "receitas", label: "Receitas da casa", icon: CookingPot },
  { id: "fichas", label: "Fichas técnicas", icon: NotebookPen },
  { id: "combos", label: "Combos", icon: ShoppingCart },
  { id: "precos", label: "Precificação", icon: Tags },
  { id: "restaurantes", label: "Restaurantes", icon: Building2 },
] as const;
const descriptions: Record<Page, string> = {
  relatorios: "Consulte vendas do Anotaí, compras, custos e resultados.",
  dre: "Confira receitas, custos e resultado por competência.",
  equilibrio: "Calcule quanto precisa faturar para cobrir os custos.",
  "fluxo-caixa": "Acompanhe entradas, saídas e o saldo previsto.",
  capital: "Acompanhe caixa, despesas e necessidade de capital.",
  compras: "Lance notas, revise os itens e acompanhe as compras.",
  visao: "Acompanhe os números e as pendências da operação.",
  dna: "Configure receita, despesas, impostos e meta de margem do mês.",
  canais: "Configure as taxas e a embalagem de cada canal de venda.",
  insumos: "Cadastre ingredientes e atualize seus custos de compra.",
  receitas: "Organize os preparos usados em mais de uma ficha técnica.",
  fichas: "Revise ingredientes, custo por porção e pendências dos pratos.",
  combos: "Monte e precifique conjuntos de produtos por canal.",
  precos: "Compare preços praticados e preços sugeridos por canal.",
  restaurantes: "Gerencie as operações cadastradas na Vila.",
};
const financeiro = ["relatorios", "dre", "equilibrio", "fluxo-caixa", "capital"] as const;
const paginasConsolidado: readonly string[] = ["visao", ...financeiro, "restaurantes"];
const paginasConsulta = new Set<Page>(["visao", "relatorios", "dre", "equilibrio", "fluxo-caixa", "capital"]);
const ordemOperacoes = ["a-vila", "bora", "nativos", "bar"];
function preparar(db: Database, id: string, mes: string) {
  if (!db.dnas.some((d) => d.restaurante_id === id && d.competencia === mes))
    db.dnas.push(novoDNA(id, mes));
  if (
    id !== "a-vila" &&
    !db.canais.some((c) => c.restaurante_id === id && c.competencia === mes)
  )
    db.canais.push(...novosCanais(id, mes));
  if (id !== "a-vila") {
    const salao = db.canais.find(
      (c) =>
        c.restaurante_id === id && c.competencia === mes && c.nome === "Salão",
    );
    if (salao && mes >= "2026-11")
      for (const p of db.produtos.filter(
        (p) => p.restaurante_id === id && p.precoCardapio !== undefined,
      )) {
        if (
          !db.precos.some(
            (v) => v.produto_id === p.id && v.canal_id === salao.id,
          )
        )
          db.precos.push({
            id: crypto.randomUUID(),
            restaurante_id: id,
            produto_id: p.id,
            canal_id: salao.id,
            valor: p.precoCardapio!,
          });
      }
  }
  return db;
}
export default function Sistema() {
  const cloud = useCloud();
  const [filtro, setFiltro] = useState("todos");
  const [backupMenu, setBackupMenu] = useState(false);
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
  const abrirMenu = useRef<HTMLButtonElement>(null);
  const fecharMenu = useRef<HTMLButtonElement>(null);
  const atual = useRef<Database | null>(null);
  useEffect(() => {
    try {
      const data = repositorio.carregar(),
        first = data.restaurantes[0].id;
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
  useEffect(() => {
    if (!menu) return;
    fecharMenu.current?.focus();
    const viewport = window.matchMedia("(max-width: 900px)");
    const fecharNoDesktop = () => {
      if (!viewport.matches) setMenu(false);
    };
    viewport.addEventListener("change", fecharNoDesktop);
    return () => viewport.removeEventListener("change", fecharNoDesktop);
  }, [menu]);
  function dispensarMenu() {
    setMenu(false);
    requestAnimationFrame(() => abrirMenu.current?.focus());
  }
  function atualizar(
    change: (draft: Database) => void,
    mensagem = cloud.mode === "cloud"
      ? "Salvo na nuvem"
      : "Salvo neste navegador",
  ) {
    if (!atual.current) return false;
    try {
      const draft = structuredClone(atual.current);
      change(draft);
      if (JSON.stringify(draft) === JSON.stringify(atual.current)) return true;
      repositorio.salvar(draft);
      atual.current = draft;
      setDb(draft);
      if (
        mensagem &&
        !["Salvo na nuvem", "Salvo neste navegador"].includes(mensagem)
      )
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
      document.querySelector('form[data-dirty="true"]') &&
      !confirm("Há alterações não salvas no DNA. Sair assim mesmo?")
    )
      return;
    const mudarParaVisao = next !== id &&
      (next === "a-vila" || id === "a-vila") &&
      !paginasConsolidado.includes(page);
    if (!mudarParaVisao && !paginasConsulta.has(page) && !prepararEdicao(next, month)) return;
    setId(next);
    setMes(month);
    if (mudarParaVisao) setPage("visao");
  }
  function prepararEdicao(operacao: string, month: string) {
    if (!atual.current) return false;
    const prepared = preparar(structuredClone(atual.current), operacao, month);
    return JSON.stringify(prepared) === JSON.stringify(atual.current) ||
      atualizar((draft) => { Object.assign(draft, prepared); }, "");
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
      setBackup(
        validarBackup(migrar(validarBackup(JSON.parse(await file.text())))),
      );
    } catch (e) {
      setMessage(`Não foi possível importar: ${(e as Error).message}`);
    }
    if (input.current) input.current.value = "";
  }
  function confirmarImportacao() {
    if (!backup) return;
    try {
      const data = preparar(
        mesclarDados(atual.current ?? backup, backup),
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
    dna = dnaComRateio(db, restaurante.id, mes);
  const ir = (p: Page, filter = "todos") => {
    if (
      document.querySelector('form[data-dirty="true"]') &&
      !confirm("Há alterações não salvas no DNA. Sair assim mesmo?")
    )
      return;
    if (!paginasConsulta.has(p) && !prepararEdicao(id, mes)) return;
    setFiltro(filter);
    setPage(p);
    setMenu(false);
    if (menu) {
      requestAnimationFrame(() => {
        document.getElementById("conteudo")?.focus();
      });
    }
  };
  const titulo = pages.find((p) => p.id === page)?.label;
  return (
    <Context.Provider
      value={{
        db,
        restaurante,
        mes,
        dna,
        atualizar,
        ir,
        filtro,
        avisar: setMessage,
        selecionar,
      }}
    >
      <a href="#conteudo" className="skip">
        Pular para o conteúdo
      </a>
      <div className="app-shell vila-shell">
        {menu && (
          <button
            aria-label="Fechar menu"
            className="menu-backdrop"
            onClick={dispensarMenu}
            tabIndex={-1}
          />
        )}
        <aside
          id="menu-gestao"
          className={`sidebar ${menu ? "opened" : ""}`}
          onKeyDown={(e) => {
            if (menu && e.key === "Escape") dispensarMenu();
          }}
        >
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
              A Vila
              <small>Gestão do restaurante</small>
            </span>
          </a>
          <button
            className="mobile-close icon-button"
            aria-label="Fechar menu"
            ref={fecharMenu}
            onClick={dispensarMenu}
          >
            <X />
          </button>
          <nav aria-label="Menu principal">
            {[
              ["Operação", ["visao", "compras"]],
              ["Financeiro", financeiro],
              [
                "Cardápio e custos",
                ["insumos", "receitas", "fichas", "precos", "combos"],
              ],
              ["Configurações", ["dna", "canais", "restaurantes"]],
            ]
              .filter(
                ([, ids]) =>
                  restaurante.id !== "a-vila" ||
                  (ids as string[]).some((pid) =>
                    paginasConsolidado.includes(pid),
                  ),
              )
              .map(([label, ids]) => (
                <div key={String(label)}>
                  <div className="nav-caption">{label}</div>
                  {(ids as string[])
                    .map((pid) => pages.find((p) => p.id === pid)!)
                    .filter(
                      (p) =>
                        restaurante.id !== "a-vila" ||
                        paginasConsolidado.includes(p.id),
                    )
                    .map((p) => (
                      <button
                        key={p.id}
                        onClick={() => ir(p.id)}
                        className={`nav-item ${page === p.id ? "active" : ""}`}
                        aria-current={page === p.id ? "page" : undefined}
                      >
                        <p.icon size={19} />
                        <span>{p.label}</span>
                      </button>
                    ))}
                </div>
              ))}
            <button
              className="nav-item"
              onClick={() => {
                setBackupMenu(true);
                setMenu(false);
              }}
            >
              <Archive size={19} />
              Backup
            </button>
          </nav>
          <div className="sidebar-bottom">
            <button
              className="nav-item"
              onClick={() => {
                setMenu(false);
                setHelp(true);
              }}
            >
              <CircleHelp size={18} />
              Entenda o DNA
            </button>
          </div>
        </aside>
        <div className="workspace" inert={menu}>
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-button menu-toggle"
                aria-label="Abrir menu"
                aria-expanded={menu}
                aria-controls="menu-gestao"
                ref={abrirMenu}
                onClick={() => setMenu(true)}
              >
                <Menu />
              </button>
              <span className="active-operation">{restaurante.nome}</span>
              <span className="crumb-slash" aria-hidden="true">/</span>
              <strong>{titulo}</strong>
            </div>
            <div className="top-actions">
              <CloudIndicator />
              <button
                className="profile"
                aria-label="Abrir configurações e backup"
                onClick={() => setBackupMenu(true)}
              >
                <Settings2 size={19} aria-hidden="true" />
              </button>
            </div>
            <div className="operation-chips" role="group" aria-label="Trocar operação">
              {[...db.restaurantes]
                .sort((a, b) => {
                  const ordem = (id: string) => {
                    const posicao = ordemOperacoes.indexOf(id);
                    return posicao < 0 ? ordemOperacoes.length : posicao;
                  };
                  return ordem(a.id) - ordem(b.id);
                })
                .map((r) => (
                  <button
                    key={r.id}
                    aria-pressed={r.id === restaurante.id}
                    className="operation-chip"
                    onClick={() => selecionar(r.id)}
                  >
                    {r.nome}
                  </button>
                ))}
            </div>
          </header>
          <main id="conteudo" tabIndex={-1}>
            <div className="page-heading">
              <div>
                <h1>{titulo}</h1>
                <p>{descriptions[page]}</p>
              </div>
              <div className="month-select" role="group" aria-label="Período">
                <span><CalendarDays size={16} aria-hidden="true" /> Período</span>
                <div className="month-controls">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Mês anterior"
                    onClick={() => {
                      const date = new Date(`${mes}-01T12:00:00Z`);
                      date.setUTCMonth(date.getUTCMonth() - 1);
                      selecionar(id, date.toISOString().slice(0, 7));
                    }}
                  >
                    <ChevronLeft />
                  </button>
                  <select
                    aria-label="Mês"
                    value={mes.slice(5)}
                    onChange={(e) =>
                      selecionar(id, `${mes.slice(0, 4)}-${e.target.value}`)
                    }
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i} value={String(i + 1).padStart(2, "0")}>
                        {new Intl.DateTimeFormat("pt-BR", {
                          month: "long",
                          timeZone: "UTC",
                        }).format(new Date(Date.UTC(2026, i, 1)))}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    aria-label="Ano"
                    min="2000"
                    max="2100"
                    value={mes.slice(0, 4)}
                    onChange={(e) => {
                      if (/^20\d{2}$|^2100$/.test(e.target.value))
                        selecionar(id, `${e.target.value}-${mes.slice(5)}`);
                    }}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Próximo mês"
                    onClick={() => {
                      const date = new Date(`${mes}-01T12:00:00Z`);
                      date.setUTCMonth(date.getUTCMonth() + 1);
                      selecionar(id, date.toISOString().slice(0, 7));
                    }}
                  >
                    <ChevronRight />
                  </button>
                </div>
              </div>
            </div>
            <div
              key={`${id}:${mes}:${page}:${filtro}:${revisao}`}
              className="page-content"
            >
              {page === "visao" && <FaturamentoMatriz setor={restaurante.id} />}
              {page === "relatorios" ? (
                <Relatorios />
              ) : page === "dre" ? (
                <Dre />
              ) : page === "equilibrio" ? (
                <PontoEquilibrio />
              ) : page === "fluxo-caixa" ? (
                <FluxoCaixa />
              ) : page === "capital" ? (
                <CapitalGiro consolidado={restaurante.id === "a-vila"} />
              ) : page === "compras" ? (
                <Compras />
              ) : restaurante.id === "a-vila" && page === "visao" ? (
                <>
                  <Vila />
                  <CapitalGiro consolidado />
                </>
              ) : page === "visao" ? (
                <Overview />
              ) : page === "dna" ? (
                <DNAEditor />
              ) : page === "canais" ? (
                <Canais />
              ) : page === "insumos" ? (
                <Insumos />
              ) : page === "receitas" ? (
                <Receitas />
              ) : page === "fichas" ? (
                <Fichas />
              ) : page === "combos" ? (
                <Combos />
              ) : page === "precos" ? (
                <Precos />
              ) : (
                <Restaurantes />
              )}
            </div>
          </main>
        </div>
      </div>
      {backupMenu && (
        <Modal title="Configuração › Backup" close={() => setBackupMenu(false)}>
          <div className="backup-actions">
            <button className="button" onClick={exportar}>
              <ArrowDownToLine size={18} />
              Exportar backup
            </button>
            <button className="button" onClick={() => input.current?.click()}>
              <ArrowUpFromLine size={18} />
              Importar backup
            </button>
            {cloud.mode === "cloud" && (
              <button
                className="button"
                disabled={cloud.saving || cloud.error}
                onClick={cloud.logout}
              >
                Sair
              </button>
            )}
          </div>
        </Modal>
      )}
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
            Os dados serão mesclados. Nos conflitos, o backup importado
            prevalece. O próximo backup inclui um histórico limitado de versões
            distintas recentes. Guarde uma cópia do arquivo original.
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
              Mesclar e importar
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
              Insumos guardam preços por competência. Receitas e pratos utilizam
              os custos do mês selecionado.
            </p>
          </div>
        </Modal>
      )}
    </Context.Provider>
  );
}
