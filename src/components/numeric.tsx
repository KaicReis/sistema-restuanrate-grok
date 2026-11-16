"use client";
import {
  useState,
  useEffect,
  type InputHTMLAttributes,
  type ChangeEvent,
} from "react";
import { numeroBR } from "@/lib/dna";
type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "value" | "defaultValue"
> & {
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
};
export function Numeric({
  value,
  defaultValue,
  onChange,
  min,
  max,
  ...props
}: Props) {
  const format = (v: string | number | undefined) =>
    v === undefined ? "" : String(v).replace(".", ",");
  const [text, setText] = useState(format(value ?? defaultValue));
  useEffect(() => {
    if (value !== undefined) {
      let n = NaN;
      try {
        n = numeroBR(text);
      } catch {}
      let next = NaN;
      try {
        next = numeroBR(String(value));
      } catch {}
      if (n !== next) setText(format(value));
    }
  }, [value]);
  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        let n = NaN;
        try {
          n = numeroBR(raw);
        } catch {}
        e.target.setCustomValidity(
          !raw && props.required
            ? "Preencha este campo."
            : raw && !Number.isFinite(n)
              ? "Use um número válido com vírgula."
              : min !== undefined && n < Number(min)
                ? `Mínimo: ${format(String(min))}.`
                : max !== undefined && n > Number(max)
                  ? `Máximo: ${format(String(max))}.`
                  : "",
        );
        if (onChange && (Number.isFinite(n) || raw === ""))
          onChange({
            ...e,
            target: { ...e.target, value: raw === "" ? "" : String(n) },
          } as ChangeEvent<HTMLInputElement>);
      }}
    />
  );
}
