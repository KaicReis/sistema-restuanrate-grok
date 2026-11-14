"use client";
import { createContext, useContext } from "react";
import type { Database, DNA, Restaurante } from "@/lib/types";
export type Page =
  | "visao"
  | "dna"
  | "canais"
  | "insumos"
  | "fichas"
  | "precos"
  | "restaurantes";
export interface AppContext {
  db: Database;
  restaurante: Restaurante;
  mes: string;
  dna: DNA;
  atualizar: (change: (draft: Database) => void, mensagem?: string) => boolean;
  ir: (page: Page) => void;
  avisar: (text: string) => void;
  selecionar: (id: string, mes?: string) => void;
}
export const Context = createContext<AppContext | null>(null);
export function useSistema() {
  const context = useContext(Context);
  if (!context) throw new Error("Sistema indisponível.");
  return context;
}
