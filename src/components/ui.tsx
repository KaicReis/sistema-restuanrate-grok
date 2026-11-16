import { Numeric } from "./numeric";
import { numeroBR } from "@/lib/dna";
import type { ReactNode } from "react";
import { X, Plus } from "lucide-react";
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Money({
  name,
  value = 0,
  required = true,
}: {
  name: string;
  value?: number;
  required?: boolean;
}) {
  return (
    <Numeric
      aria-label={name}
      name={name}
      min="0"
      max="99999999999"
      step="0.01"
      defaultValue={value ? value / 100 : ""}
      placeholder="0,00"
      required={required}
      inputMode="decimal"
    />
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-symbol">↗</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Panel({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function AddButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className="button primary" onClick={onClick}>
      <Plus size={18} />
      {children}
    </button>
  );
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  return (
    <dialog
      className="modal"
      ref={(el) => {
        if (el && !el.open) el.showModal();
      }}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Fechar janela"
          onClick={close}
        >
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export const formString = (f: FormData, name: string) =>
  String(f.get(name) ?? "").trim();
export const formNumber = (f: FormData, name: string) =>
  numeroBR(formString(f, name));

export function confirmarExclusao(nome: string): Promise<boolean> {
  return new Promise((resolve) => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.createElement("dialog");
    dialog.className = "modal";
    const title = document.createElement("h2");
    title.textContent = `Excluir “${nome}”?`;
    const copy = document.createElement("p");
    copy.textContent = "Confirme a exclusão deste item.";
    const actions = document.createElement("div");
    actions.className = "form-actions";
    const cancel = document.createElement("button");
    cancel.className = "button";
    cancel.textContent = "Cancelar";
    const accept = document.createElement("button");
    accept.className = "button primary";
    accept.textContent = "Excluir";
    const finish = (value: boolean) => {
      dialog.close();
      dialog.remove();
      previous?.focus();
      resolve(value);
    };
    cancel.onclick = () => finish(false);
    accept.onclick = () => finish(true);
    dialog.oncancel = (event) => {
      event.preventDefault();
      finish(false);
    };
    actions.append(cancel, accept);
    dialog.append(title, copy, actions);
    document.body.append(dialog);
    dialog.showModal();
    cancel.focus();
  });
}
