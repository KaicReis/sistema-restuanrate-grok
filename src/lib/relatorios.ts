import Decimal from "decimal.js";
import { demonstrativo } from "./financeiro";
import { resumoCompra } from "./purchases";
import type { Database } from "./types";
import { operacoes, ratear } from "./v2";

export interface MesRelatorio {
  mes: string;
  fixos: number | null;
  compras: number | null;
  resultado: number | null;
  receita: number | null;
  cmv: number | null;
  quantidadeCompras: number;
  setoresFechados: number;
  setoresTotal: number;
  setoresComFixos: number;
  aluguelSemRateio: number;
}

const somar = (valores: (number | null)[]): number | null =>
  valores.some((valor) => valor !== null)
    ? valores.reduce<number>((total, valor) => total + (valor ?? 0), 0)
    : null;

function apurarMes(db: Database, mes: string, setor: string) {
  const grupo = setor === "a-vila";
  const selecionadas = operacoes(db).filter((r) => grupo || r.id === setor);
  const aluguel = db.alugueis?.find((a) => a.competencia === mes);
  const rateios = ratear(db, mes);
  const aluguelSemRateio = Math.max(
    0, (aluguel?.valor ?? 0) - Object.values(rateios).reduce((total, valor) => total + valor, 0),
  );
  const categorias = new Map<string, { nome: string; valor: number }>();
  function somarCategoria(nome: string, valor: number) {
    const chave = nome.toLocaleLowerCase("pt-BR");
    const existente = categorias.get(chave);
    if (existente) existente.valor += valor;
    else categorias.set(chave, { nome, valor });
  }
  const fornecedores = new Map<string, { nome: string; valor: number; quantidade: number }>();
  const comprasDoMes = (db.compras ?? []).filter((c) => c.data.startsWith(mes + "-"));
  let quantidadeCompras = 0;
  const setores = selecionadas.map(({ id, nome }) => {
    const dna = db.dnas.find((d) => d.restaurante_id === id && d.competencia === mes);
    const fixos = (dna?.fixos ?? []).filter((f) => f.natureza === "operacional");
    for (const fixo of fixos) {
      somarCategoria(fixo.categoria.trim() || "Sem categoria", fixo.valor);
    }
    const cotaAluguel = rateios[id] ?? 0;
    if (cotaAluguel) somarCategoria("Aluguel", cotaAluguel);

    const compras = comprasDoMes.filter((c) => c.restaurante_id === id);
    quantidadeCompras += compras.length;
    const totalCompras = compras.reduce((total, compra) => {
      const valor = new Decimal(resumoCompra(compra).total).times(100).toDecimalPlaces(0).toNumber();
      const fornecedor = compra.fornecedor.trim() || "Fornecedor não identificado";
      const chave = fornecedor.toLocaleLowerCase("pt-BR");
      const registrado = fornecedores.get(chave);
      if (registrado) {
        registrado.valor += valor;
        registrado.quantidade++;
      } else {
        fornecedores.set(chave, { nome: fornecedor, valor, quantidade: 1 });
      }
      return total + valor;
    }, 0);
    return {
      id, nome,
      fixos: fixos.length || cotaAluguel
        ? fixos.reduce((total, fixo) => total + fixo.valor, cotaAluguel) : null,
      compras: compras.length ? totalCompras : null,
      resultado: demonstrativo(db, mes, id).resultado,
    };
  });
  const dre = demonstrativo(db, mes, setor);
  if (grupo && aluguelSemRateio) somarCategoria("Aluguel sem rateio", aluguelSemRateio);
  const totalFixos = somar([
    ...setores.map((r) => r.fixos),
    grupo && aluguelSemRateio > 0 ? aluguelSemRateio : null,
  ]);
  const atual: MesRelatorio = {
    mes, fixos: totalFixos,
    compras: somar(setores.map((r) => r.compras)),
    resultado: dre.resultado, receita: dre.receita, cmv: dre.cmv,
    quantidadeCompras,
    setoresFechados: setores.filter((r) => r.resultado !== null).length,
    setoresTotal: setores.length,
    setoresComFixos: setores.filter((r) => r.fixos !== null).length,
    aluguelSemRateio,
  };

  return {
    atual, setores,
    categorias: [...categorias.values()].sort((a, b) => b.valor - a.valor),
    fornecedores: [...fornecedores.values()].sort((a, b) => b.valor - a.valor),
  };
}

export function montarRelatorio(db: Database, mes: string, setor: string, quantidadeMeses: number) {
  const atual = apurarMes(db, mes, setor);
  const [ano, numeroMes] = mes.split("-").map(Number);
  const anteriores = Array.from({ length: quantidadeMeses - 1 }, (_, i) => {
    const data = new Date(Date.UTC(ano, numeroMes - quantidadeMeses + i, 1));
    return apurarMes(db, data.toISOString().slice(0, 7), setor).atual;
  });
  return { ...atual, serie: [...anteriores, atual.atual] };
}
