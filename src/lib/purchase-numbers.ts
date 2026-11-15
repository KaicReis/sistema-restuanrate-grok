/** Strings entered by the user are pt-BR; API/JSON numbers are already normalized. */
export function numeroBR(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") throw new Error("Número inválido");
  const s = value.trim().replace(/^R\$\s*/, "");
  if (!/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,4})?$/.test(s))
    throw new Error(
      "Use número brasileiro, por exemplo 1.168,98 (até 4 casas)",
    );
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n)) throw new Error("Número inválido");
  return n;
}
export const formatarBR = (value: number) =>
  value.toLocaleString("pt-BR", {
    maximumFractionDigits: 4,
    useGrouping: false,
  });
