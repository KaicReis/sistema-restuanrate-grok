"use client";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Database } from "@/lib/types";
import { repositorio, validarBackup } from "@/lib/storage";
import { criarBase } from "@/lib/storage/seed";
import { conciliarDados } from "@/lib/sincronizacao";
const chaveRascunho = "vila:rascunho-nuvem";
const avisoConflito = "Outro dispositivo alterou os dados. Baixe as alterações locais antes de carregar a versão da nuvem.";
type Rascunho = { revision: number; data: Database };

function lerRascunho(): Rascunho | null {
  try {
    const bruto = sessionStorage.getItem(chaveRascunho);
    if (!bruto) return null;
    const { revision, data } = JSON.parse(bruto);
    if (!Number.isSafeInteger(revision) || revision < 0) return null;
    return { revision, data: validarBackup(data) };
  } catch {
    return null;
  }
}

function enviarDados(data: Database, revision: number) {
  return fetch("/api/data", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data, revision }),
  });
}

function editandoDados() {
  return Boolean(
    document.querySelector('form[data-dirty="true"], dialog[open]') ||
      document.activeElement?.matches("input,select,textarea,[contenteditable=true]"),
  );
}

const CloudContext = createContext({
  mode: "local",
  notice: "",
  saving: false,
  error: false,
  conflict: false,
  retry: () => {},
  exportDraft: () => {},
  reloadCloud: () => {},
  logout: () => {},
});
export const useCloud = () => useContext(CloudContext);
export function CloudIndicator() {
  const cloud = useCloud();
  return (
    <div
      title={cloud.error ? cloud.notice : undefined}
      className={`cloud-indicator ${cloud.error ? "negative" : ""}`}
      role="status"
    >
      <span>
        {cloud.error
          ? cloud.conflict ? "Conflito de sincronização" : "Erro ao salvar"
          : cloud.saving
            ? "Salvando…"
            : cloud.mode === "cloud"
              ? "Salvo na nuvem"
              : "Salvo neste navegador"}
      </span>
      {cloud.error && (
        <>
          <span className="sr-only">{cloud.notice}</span>
          <button className="button" onClick={cloud.exportDraft}>
            Baixar alterações locais
          </button>
          {cloud.conflict ? (
            <button className="button" onClick={cloud.reloadCloud}>
              Carregar versão da nuvem
            </button>
          ) : (
            <button className="button" onClick={cloud.retry}>
              Tentar de novo
            </button>
          )}
        </>
      )}
    </div>
  );
}
export function Cloud({ children }: { children: ReactNode }) {
  const [state, setState] = useState<
      "loading" | "login" | "ready" | "error"
    >("loading"),
    [mode, setMode] = useState(""),
    [notice, setNotice] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [attempted, setAttempted] = useState(false),
    [entering, setEntering] = useState(false),
    [showPassword, setShowPassword] = useState(false),
    [syncError, setSyncError] = useState(false),
    [conflict, setConflict] = useState(false);
  const revision = useRef(0),
    pending = useRef(0),
    stopped = useRef(false),
    chain = useRef(Promise.resolve()),
    base = useRef<Database | null>(null),
    draft = useRef<Database | null>(null),
    draftExported = useRef<Database | null>(null),
    savingGeneration = useRef(0),
    confirmedReload = useRef(false);

  function persistirRascunho() {
    try {
      if (draft.current) {
        sessionStorage.setItem(chaveRascunho, JSON.stringify({
          revision: revision.current,
          data: draft.current,
        } satisfies Rascunho));
      } else {
        sessionStorage.removeItem(chaveRascunho);
      }
    } catch {
      // O rascunho permanece no navegador e pode ser baixado pela sessão atual.
    }
  }

  async function initialize() {
    try {
      const auth = await fetch("/api/auth", { cache: "no-store" });
      const a = await auth.json();
      if (!auth.ok) throw new Error(a.error);
      setMode(a.mode);
      if (a.mode === "local") {
        setNotice(
          "DATABASE_URL não configurada: dados apenas neste navegador, sem sincronização.",
        );
        setState("ready");
        return;
      }
      if (!a.user) {
        setState("login");
        return;
      }
      const response = await fetch("/api/data", { cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível carregar o banco.");
      const cloud = await response.json();
      revision.current = cloud.revision;
      const data = cloud.data ? validarBackup(cloud.data) : criarBase();
      const recuperado = lerRascunho();
      base.current = data;
      const copiaLocal =
        localStorage.getItem("dna-restaurante:v2") ??
        localStorage.getItem("dna-restaurante:v1");
      if (
        copiaLocal &&
        (localStorage.getItem("vila:pending") ||
          !localStorage.getItem("vila:linked"))
      ) {
        localStorage.setItem("dna-restaurante:antes-da-nuvem", copiaLocal);
      }
      if (recuperado) {
        const alteradoNaNuvem = recuperado.revision !== cloud.revision;
        if (alteradoNaNuvem) base.current = null;
        revision.current = recuperado.revision;
        draft.current = recuperado.data;
        stopped.current = true;
        setSyncError(true);
        setConflict(alteradoNaNuvem);
        setNotice(alteradoNaNuvem ? avisoConflito : "Alterações locais aguardam sincronização.");
      } else {
        setNotice("Salvo na nuvem");
      }
      repositorio.salvar(recuperado?.data ?? data);
      localStorage.setItem("vila:linked", "true");
      localStorage.removeItem("vila:pending");
      setState("ready");
    } catch (e) {
      setNotice((e as Error).message);
      setState("error");
    }
  }
  useEffect(() => {
    void initialize();
  }, []);
  useLayoutEffect(() => {
    if (state !== "ready" || mode !== "cloud") return;
    const controle = new AbortController();
    let consultando = false;
    async function tentarConciliar(data: Database, enviada: number) {
      const anterior = base.current;
      const elegivel = () => !controle.signal.aborted &&
        pending.current === 1 && draft.current === data && !editandoDados();
      if (!anterior || !elegivel()) return false;
      try {
        const resposta = await fetch("/api/data", { cache: "no-store", signal: controle.signal });
        if (!resposta.ok) return false;
        const remoto = await resposta.json();
        if (!elegivel() || !Number.isSafeInteger(remoto.revision) || remoto.revision <= enviada) return false;
        const conciliado = conciliarDados(anterior, data, validarBackup(remoto.data));
        if (!conciliado) return false;
        const envio = await enviarDados(validarBackup(conciliado), remoto.revision);
        const resultado = await envio.json().catch(() => null);
        if (!envio.ok || resultado?.revision !== remoto.revision + 1 || !elegivel()) return false;
        revision.current = resultado.revision;
        draft.current = null;
        persistirRascunho();
        confirmedReload.current = true;
        window.location.reload();
        return true;
      } catch {
        return false;
      }
    }
    const save = (event: Event) => {
      const data = structuredClone((event as CustomEvent<Database>).detail);
      draft.current = data;
      savingGeneration.current++;
      persistirRascunho();
      if (stopped.current) return;
      pending.current++;
      setSyncError(false);
      setNotice("Salvando…");
      chain.current = chain.current
        .then(async () => {
          if (stopped.current) return;
          const enviada = revision.current;
          const res = await enviarDados(data, enviada);
          if (res.status === 409) {
            if (await tentarConciliar(data, enviada)) return;
            setConflict(true);
            throw new Error(avisoConflito);
          }
          if (res.status === 401)
            throw new Error("Sessão expirada. Baixe as alterações locais e entre novamente.");
          const result = await res.json().catch(() => null);
          if (!res.ok || result?.revision !== enviada + 1)
            throw new Error(result?.error || "Não foi possível sincronizar. A cópia local foi preservada.");
          revision.current = result.revision;
          base.current = data;
          if (draft.current === data) draft.current = null;
          persistirRascunho();
        })
        .catch((e) => {
          stopped.current = true;
          setSyncError(true);
          persistirRascunho();
          setNotice((e as Error).message);
        })
        .finally(() => {
          pending.current--;
          if (!pending.current && !stopped.current) {
            setNotice("Salvo na nuvem");
          }
        });
    };
    window.addEventListener("vila-save", save);
    const podeAtualizar = () =>
      !pending.current &&
      !stopped.current &&
      !editandoDados();
    const timer = setInterval(async () => {
      if (consultando || !podeAtualizar()) return;
      consultando = true;
      const geracao = savingGeneration.current;
      try {
        const res = await fetch("/api/data?meta=1", {
          cache: "no-store",
          signal: controle.signal,
        });
        if (!res.ok) return;
        const result = await res.json();
        if (
          !controle.signal.aborted &&
          Number.isSafeInteger(result.revision) &&
          result.revision > revision.current &&
          savingGeneration.current === geracao &&
          podeAtualizar()
        ) {
          window.location.reload();
        }
      } catch {
        /* próxima consulta tentará novamente */
      } finally {
        consultando = false;
      }
    }, 15000);
    const before = (e: BeforeUnloadEvent) => {
      if (!confirmedReload.current && (pending.current || stopped.current)) {
        persistirRascunho();
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => {
      window.removeEventListener("vila-save", save);
      window.removeEventListener("beforeunload", before);
      controle.abort();
      clearInterval(timer);
    };
  }, [state, mode]);
  if (state === "ready")
    return (
      <CloudContext.Provider
        value={{
          mode,
          notice,
          saving: notice === "Salvando…",
          error: syncError,
          conflict,
          retry: () => {
            const dados = draft.current;
            if (conflict || !dados || pending.current) return;
            stopped.current = false;
            setSyncError(false);
            window.dispatchEvent(
              new CustomEvent("vila-save", { detail: dados }),
            );
          },
          exportDraft: () => {
            if (!draft.current) return;
            const url = URL.createObjectURL(new Blob([JSON.stringify(draft.current, null, 2)], {
              type: "application/json",
            }));
            const link = document.createElement("a");
            link.href = url;
            link.download = "vila-alteracoes-locais.json";
            link.click();
            draftExported.current = draft.current;
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          },
          reloadCloud: () => {
            if (!draft.current || !conflict || pending.current) return;
            try {
              localStorage.setItem("dna-restaurante:antes-da-nuvem", JSON.stringify(draft.current));
            } catch {
              if (draftExported.current !== draft.current) {
                setNotice("Não foi possível proteger o rascunho no navegador. Baixe as alterações locais antes de recarregar.");
                return;
              }
            }
            try { sessionStorage.removeItem(chaveRascunho); } catch {}
            confirmedReload.current = true;
            window.location.reload();
          },
          logout: async () => {
            if (pending.current || stopped.current) return;
            await fetch("/api/auth", { method: "DELETE" });
            window.location.reload();
          },
        }}
      >
        {children}
      </CloudContext.Provider>
    );
  return (
    <main className="loading">
      <h1>A Vila</h1>
      {(notice || state === "loading") && (
        <p role="status">{notice || "Conectando…"}</p>
      )}
      {state === "login" && (
        <form
          className={`login-form ${attempted ? "attempted" : ""}`}
          onInvalid={() => setAttempted(true)}
          onSubmit={async (e) => {
            e.preventDefault();
            setAttempted(true);
            setEntering(true);
            setNotice("");
            try {
              const res = await fetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
              });
              const result = await res.json();
              if (!res.ok) throw new Error(result.error);
              setPassword("");
              await initialize();
            } catch (e) {
              setNotice(
                "Não foi possível entrar. Confira seu e-mail e senha e tente novamente.",
              );
            } finally {
              setEntering(false);
            }
          }}
        >
          <label className="field">
            E-mail
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            Senha
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="button"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? "Ocultar senha" : "Mostrar senha"}
          </button>
          <button className="button primary" disabled={entering}>
            {entering ? "Entrando…" : "Entrar"}
          </button>
        </form>
      )}
      {state === "error" && (
        <button className="button" onClick={() => void initialize()}>
          Tentar novamente
        </button>
      )}
    </main>
  );
}
