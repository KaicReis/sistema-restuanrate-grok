import type { Database, Produto, ReceitaCasa } from "@/lib/types";
import { calcularCMV, custoReceita } from "@/lib/dna";
import { insumosMes } from "@/lib/v2";
export function preparoPendente(
  db: Database,
  mes: string,
  p: Produto | ReceitaCasa,
  casa = false,
) {
  if (p.pendente || !p.itens.length) return true;
  try {
    if (casa)
      custoReceita(p as ReceitaCasa, insumosMes(db, mes), db.receitas ?? []);
    else calcularCMV(p as Produto, insumosMes(db, mes), db.receitas);
    return false;
  } catch {
    return true;
  }
}
