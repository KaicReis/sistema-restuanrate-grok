import { describe, expect, it } from "vitest";
import { validarNota } from "../src/lib/purchase-validation";
const itens = [[2,19.9,39.8],[1,316,316],[1,80.4,80.4],[2,98.96,197.92],[1,123.87,123.87],[1,339.45,339.45],[1,71.54,71.54]].map(([quantidade,valorUnitario,total]) => ({quantidade,valorUnitario,total}));
const nota = { itens, totalProdutos: 1168.98, totalNota: 1168.98, desconto: 0, frete: 0, outrasDespesas: 0 };
describe("conferência aritmética DANFE real", () => {
  it("aceita todos os valores reais e decimais", () => expect(validarNota(nota).valido).toBe(true));
  it("detecta as quatro leituras incorretas", () => {
    const errado = { ...nota, itens: itens.map((i,index) => ({...i, valorUnitario: [19,36,18,116.8][index] ?? i.valorUnitario})) };
    expect(validarNota(errado).linhas.map(l => l.index)).toEqual([0,1,2,3]);
  });
  it("tolera um centavo inclusive na fronteira decimal", () => expect(validarNota({...nota,itens: itens.map((i,index) => index ? i : {...i,total:39.81})}).valido).toBe(true));
  it("detecta os dois totais e aplica desconto, frete e outras", () => {
    expect(validarNota({...nota,totalProdutos:1000}).totais).toHaveLength(2);
    expect(validarNota({...nota,totalProdutos:1000,totalNota:1}).valido).toBe(true);
    expect(validarNota({...nota,desconto:10,frete:5,outrasDespesas:2,totalNota:1165.98}).valido).toBe(true);
  });
  it("mantém campos ilegíveis pendentes", () => expect(validarNota({...nota,itens:[{quantidade:null,total:2,valorUnitario:2}]}).valido).toBe(false));
});
