import { expect, it } from "vitest";
import { importarVendasSetorCanal } from "../src/lib/vendas-setor-canal";
import type { VendaAnotaiMensal } from "../src/lib/vendas-anotai";

const setores = [
  { id: "nativos", nome: "Nativo’s Sushi" },
  { id: "bar", nome: "Bar" },
  { id: "bora", nome: 'Bora Burguer, "Casa"' },
];

const referencia: VendaAnotaiMensal = {
  competencia: "2026-11",
  salaoDesde: "2026-11-01",
  periodoAte: "2026-11-21",
  pedidosExportados: 5,
  canais: {
    salao: { pedidos: 2, subtotal: 14_630, frete: 0, total: 14_630 },
    delivery: { pedidos: 1, subtotal: 9_037, frete: 1_000, total: 10_037 },
    retirada: { pedidos: 1, subtotal: 1_590, frete: 0, total: 1_590 },
  },
};

const pedidosCsv = [
  "pedido;data;canal;subtotal_sem_frete",
  "100;01/11/2026;salao;129,30",
  "100;02/11/2026;delivery;90,37",
  "101;03/11/2026;retirada;15,90",
  "102;04/11/2026;salao;17,00",
].join("\r\n");

const itensCsv = [
  "pedido,data,setor,valor_liquido",
  "100,2026-11-01,nativos,89.40",
  "100,2026-11-01, Bar ,39.90",
  '100,2026-11-02,"Bora Burguer, ""Casa""",70.37',
  "100,2026-11-02,bar,20.00",
  "101,2026-11-03,bora,15.90",
  "102,2026-11-04,Nativo’s Sushi,17.00",
].join("\n");

const importar = (override?: Partial<Parameters<typeof importarVendasSetorCanal>[0]>) =>
  importarVendasSetorCanal({ pedidosCsv, itensCsv, setores, referencia, ...override });

it("cruza pedido e data, distribui pedidos mistos e agrega os valores líquidos sem frete", () => {
  const resultado = importar();

  expect(resultado).toMatchObject({ competencia: "2026-11", periodoAte: "2026-11-21" });
  expect(resultado.linhas).toHaveLength(5);
  expect(resultado.linhas).toEqual(expect.arrayContaining([
    { restaurante_id: "nativos", canal: "salao", subtotal: 10_640 },
    { restaurante_id: "bar", canal: "salao", subtotal: 3_990 },
    { restaurante_id: "bora", canal: "delivery", subtotal: 7_037 },
    { restaurante_id: "bar", canal: "delivery", subtotal: 2_000 },
    { restaurante_id: "bora", canal: "retirada", subtotal: 1_590 },
  ]));
});

it("aceita o CSV do Anotaí, usa seu subtotal e ignora cancelamentos e descontos informativos", () => {
  const pedidosAnotai = [
    "Número do Pedido,Data,Retirada,Subtotal (Total - Valor do frete),Valor do frete,Valor total,Descontos (Apenas Informativo),Status",
    "100,01/11/2026,Consumido no estabelecimento,129.30,0,129.30,0,Finalizado",
    "100,02/11/2026,Delivery,90.37,10,100.37,5,Finalizado",
    "101,03/11/2026,Retirado no estabelecimento,15.90,0,15.90,0,Finalizado",
    "102,04/11/2026,Consumido no estabelecimento,17,0,17,0,Finalizado",
    "103,04/11/2026,Delivery,13.50,10,23.50,0,Cancelado",
  ].join("\n");

  expect(importar({ pedidosCsv: pedidosAnotai })).toEqual(importar());
});

it("rejeita um pedido repetido no mesmo dia", () => {
  expect(() => importar({
    pedidosCsv: pedidosCsv + "\r\n100;01/11/2026;salao;129,30",
  })).toThrow();
});

it("rejeita um item órfão mesmo quando o número do pedido existe em outra data", () => {
  expect(() => importar({
    itensCsv: itensCsv.replace("100,2026-11-02,bar", "100,2026-11-03,bar"),
  })).toThrow();
});

it("rejeita um pedido sem itens", () => {
  expect(() => importar({
    itensCsv: itensCsv.replace("\n101,2026-11-03,bora,15.90", ""),
  })).toThrow();
});

it("rejeita um setor que não pertence às operações disponíveis", () => {
  expect(() => importar({
    itensCsv: itensCsv.replace("102,2026-11-04,Nativo’s Sushi", "102,2026-11-04,Outra operação"),
  })).toThrow();
});

it("rejeita valores de itens diferentes do subtotal de cada pedido, mesmo com a mesma soma por canal", () => {
  expect(() => importar({
    itensCsv: itensCsv.replace("89.40", "90.40").replace("17.00", "16.00"),
  })).toThrow();
});

it("rejeita divergência na quantidade de pedidos por canal, mesmo com a mesma contagem total", () => {
  expect(() => importar({
    referencia: {
      ...referencia,
      canais: {
        ...referencia.canais,
        salao: { ...referencia.canais.salao, pedidos: 1 },
        delivery: { ...referencia.canais.delivery, pedidos: 2 },
      },
    },
  })).toThrow();
});

it("rejeita divergência no subtotal por canal, mesmo com o mesmo faturamento consolidado", () => {
  expect(() => importar({
    referencia: {
      ...referencia,
      canais: {
        ...referencia.canais,
        salao: { ...referencia.canais.salao, subtotal: 14_629, total: 14_629 },
        delivery: { ...referencia.canais.delivery, subtotal: 9_038, total: 10_038 },
      },
    },
  })).toThrow();
});

it("rejeita pedidos após a data final de uma competência parcial", () => {
  expect(() => importar({
    pedidosCsv: pedidosCsv.replace("03/11/2026", "22/11/2026"),
    itensCsv: itensCsv.replace("2026-11-03", "2026-11-22"),
  })).toThrow();
});
