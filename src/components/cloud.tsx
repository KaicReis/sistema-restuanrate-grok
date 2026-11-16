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
import { mesclarDados } from "@/lib/import-data";
import { migrar } from "@/lib/storage/migrate";
const CloudContext = createContext({
  mode: "local",
  notice: "",
  saving: false,
  error: false,
  retry: () => {},
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
      {cloud.error
        ? "Erro ao salvar"
        : cloud.saving
          ? "Salvando…"
          : cloud.mode === "cloud"
            ? "Salvo na nuvem"
            : "Salvo neste navegador"}
      {cloud.error && (
        <button className="button" onClick={cloud.retry}>
          Tentar de novo
        </button>
      )}
    </div>
  );
}
export function Cloud({ children }: { children: ReactNode }) {
  const [state, setState] = useState<
      "loading" | "login" | "import" | "ready" | "error"
    >("loading"),
    [mode, setMode] = useState(""),
    [notice, setNotice] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [attempted, setAttempted] = useState(false),
    [entering, setEntering] = useState(false),
    [showPassword, setShowPassword] = useState(false),
    [syncError, setSyncError] = useState(false);
  const revision = useRef(0),
    pending = useRef(0),
    stopped = useRef(false),
    server = useRef<Database | null>(null),
    chain = useRef(Promise.resolve()),
    local = useRef<Database | null>(null);
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
      server.current = cloud.data;
      try {
        local.current = repositorio.carregar();
      } catch {
        local.current = null;
      }
      if (
        !cloud.data ||
        (local.current &&
          (localStorage.getItem("vila:pending") ||
            (!localStorage.getItem("vila:linked") &&
              (localStorage.getItem("dna-restaurante:v2") ||
                localStorage.getItem("dna-restaurante:v1")))))
      ) {
        setState("import");
        return;
      }
      if (local.current)
        localStorage.setItem(
          "dna-restaurante:antes-da-nuvem",
          JSON.stringify(local.current),
        );
      repositorio.salvar(validarBackup(cloud.data));
      localStorage.setItem("vila:linked", "true");
      setNotice("Salvo na nuvem");
      setState("ready");
    } catch (e) {
      setNotice((e as Error).message);
      setState("error");
    }
  }
  useEffect(() => {
    void initialize();
  }, []);
  async function firstImport(file?: File) {
    try {
      if (file && file.size > 10 * 1024 * 1024)
        throw new Error("Backup deve ter até 10 MB");
      const parsed = file
        ? validarBackup(migrar(validarBackup(JSON.parse(await file.text()))))
        : null;
      const incoming =
        parsed && local.current
          ? mesclarDados(local.current, parsed)
          : (parsed ?? local.current ?? repositorio.carregar());
      const data = server.current
        ? mesclarDados(server.current, incoming)
        : incoming;
      const res = await fetch("/api/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, revision: revision.current }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      revision.current = result.revision;
      repositorio.salvar(data);
      localStorage.setItem("vila:linked", "true");
      localStorage.removeItem("vila:pending");
      setNotice("Dados importados e sincronizados.");
      setState("ready");
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  useLayoutEffect(() => {
    if (state !== "ready" || mode !== "cloud") return;
    const save = (event: Event) => {
      if (stopped.current) {
        localStorage.setItem("vila:pending", "true");
        setNotice(
          "Sincronização interrompida. Exporte o backup local e recarregue para conciliar.",
        );
        return;
      }
      const data = structuredClone((event as CustomEvent<Database>).detail);
      pending.current++;
      localStorage.setItem("vila:pending", "true");
      setSyncError(false);
      setNotice("Salvando…");
      chain.current = chain.current
        .then(async () => {
          if (stopped.current) return;
          const res = await fetch("/api/data", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data, revision: revision.current }),
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || "Sessão expirada.");
          revision.current = result.revision;
        })
        .catch((e) => {
          stopped.current = true;
          setSyncError(true);
          setNotice(
            (e as Error).message +
              " Exporte o backup local antes de recarregar.",
          );
        })
        .finally(() => {
          pending.current--;
          if (!pending.current && !stopped.current) {
            localStorage.removeItem("vila:pending");
            setNotice("Salvo na nuvem");
          }
        });
    };
    window.addEventListener("vila-save", save);
    const timer = setInterval(async () => {
      if (
        pending.current ||
        stopped.current ||
        document.querySelector('form[data-dirty="true"]') ||
        document.activeElement?.matches("input,select,textarea")
      )
        return;
      try {
        const res = await fetch("/api/data", { cache: "no-store" });
        if (!res.ok) return;
        const result = await res.json();
        if (result.revision > revision.current && !pending.current) {
          localStorage.setItem(
            "dna-restaurante:v2",
            JSON.stringify(result.data),
          );
          window.location.reload();
        }
      } catch {
        /* próxima consulta tentará novamente */
      }
    }, 15000);
    const before = (e: BeforeUnloadEvent) => {
      if (pending.current || stopped.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => {
      window.removeEventListener("vila-save", save);
      window.removeEventListener("beforeunload", before);
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
          retry: () => {
            stopped.current = false;
            setSyncError(false);
            window.dispatchEvent(
              new CustomEvent("vila-save", { detail: repositorio.carregar() }),
            );
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
      {state === "import" && (
        <>
          <p>
            Importe os dados deste navegador e/ou um backup JSON. Em conflitos,
            os dados importados prevalecem, e as versões integrais ficam
            arquivadas no backup exportável (importacoes).
          </p>
          {server.current && (
            <button
              className="button"
              onClick={() => {
                if (local.current)
                  localStorage.setItem(
                    "dna-restaurante:antes-da-nuvem",
                    JSON.stringify(local.current),
                  );
                repositorio.salvar(server.current!);
                localStorage.setItem("vila:linked", "true");
                localStorage.removeItem("vila:pending");
                setState("ready");
                setNotice(
                  "Dados da nuvem carregados. Cópia anterior preservada neste navegador.",
                );
              }}
            >
              Usar dados da nuvem
            </button>
          )}
          <button className="button primary" onClick={() => void firstImport()}>
            Importar dados locais automaticamente
          </button>
          <label className="field">
            Importar backup JSON
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                if (e.target.files?.[0]) void firstImport(e.target.files[0]);
              }}
            />
          </label>
        </>
      )}
      {state === "error" && (
        <button className="button" onClick={() => void initialize()}>
          Tentar novamente
        </button>
      )}
    </main>
  );
}
