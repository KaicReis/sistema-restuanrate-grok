import { describe, it, expect } from "vitest";
import { numeroBR } from "../src/lib/purchase-numbers";
import {
  compraSchema,
  confirmarCompra,
  extrairEmbalagem,
  prepararLinha,
  ratearCompra,
  converterConteudo,
  totalPorCusto,
  type Compra,
} from "../src/lib/purchases";
import { parseNFe, fiscalJsonSchema } from "../src/lib/server/fiscal";
import { criarBase } from "../src/lib/storage/seed";
import { migrar } from "../src/lib/storage/migrate";
import { validarBackup } from "../src/lib/storage";
const itens = [
  ["HEINZ MAIONESE SC 144/7G", "CX", "2,00", "19,9000", "39,80", 1.008, "kg"],
  [
    "MCCAIN SURECRISP 9MM 6 X 2,5KG",
    "CX",
    "1,00",
    "316,0000",
    "316,00",
    15,
    "kg",
  ],
  [
    "PAO DE HAMBURGUER BRIOCHE 36UN",
    "CX",
    "1,00",
    "80,4000",
    "80,40",
    36,
    "un",
  ],
  [
    "POLENGUI CHEDDAR 2,27KG 160 FATIAS",
    "PC",
    "2,00",
    "98,9600",
    "197,92",
    2.27,
    "kg",
  ],
  [
    "POLENGUI QUEIJO MUZZA 192F 2,735KG",
    "PC",
    "1,00",
    "123,8700",
    "123,87",
    2.735,
    "kg",
  ],
  [
    "SEARA BACON FATIADO REZENDE 12 X 650G",
    "CX",
    "1,00",
    "339,4500",
    "339,45",
    7.8,
    "kg",
  ],
  [
    "5 MINUTOS COSTELA DESFIADA 1 KG",
    "UN",
    "1,00",
    "71,5400",
    "71,54",
    1,
    "kg",
  ],
] as const;
function nota() {
  return compraSchema.parse({
    id: "danfe",
    restaurante_id: "bar",
    fornecedor: "Distribuidora",
    data: "2026-11-15",
    totalProdutos: "1.168,98",
    desconto: "56,46",
    totalNota: "1.112,52",
    itens: itens.map(
      ([nome, unidadeComercial, quantidade, valorUnitario, total], index) => ({
        nome,
        codigo: String(index),
        unidadeComercial,
        quantidade,
        valorUnitario,
        total,
        ...extrairEmbalagem(nome, unidadeComercial),
      }),
    ),
  });
}
describe("compras v3.1 — DANFE real", () => {
  it.each([
    ["19,9000", 19.9],
    ["316,0000", 316],
    ["1.168,98", 1168.98],
    ["2,00", 2],
    ["0,0001", 0.0001],
    ["1.234.567,8912", 1234567.8912],
    [19.9, 19.9],
  ])("normaliza %s", (s, n) => expect(numeroBR(s)).toBe(n));
  it.each(["", "1.23,00", "19,12345", "2,3,4", "abc", "1e3", Infinity, null])(
    "recusa número inválido %s",
    (s) => expect(() => numeroBR(s)).toThrow(),
  );
  it.each(itens)(
    "extrai conteúdo de %s",
    (nome, un, _q, _v, _t, conteudo, unidade) => {
      expect(extrairEmbalagem(nome, un)).toEqual({
        conteudo,
        unidade,
        conversaoPendente: false,
      });
    },
  );
  it("não confunde peso de produto vendido por kg; sinaliza caixa desconhecida", () => {
    expect(extrairEmbalagem("QUEIJO 2,27KG", "KG").conteudo).toBe(1);
    expect(extrairEmbalagem("ARROZ", "FD").conversaoPendente).toBe(true);
    expect(extrairEmbalagem("LEITE 12 X 1L", "CX")).toMatchObject({
      conteudo: 12,
      unidade: "L",
    });
    expect(extrairEmbalagem("MOLHO 6 X 500ML", "CX")).toMatchObject({
      conteudo: 3,
      unidade: "L",
    });
  });
  it("fecha total, rateia centavos e salva quantidade convertida com custo líquido", () => {
    const db = migrar(criarBase()),
      n = nota();
    const r = ratearCompra(n);
    expect(r.divergencia).toBe("");
    expect(r.centavos.reduce((s, v) => s + v, 0)).toBe(111252);
    confirmarCompra(db, n);
    itens.forEach(([nome, , q, , , c, u], index) => {
      const i = db.insumos.find((i) => i.nome === nome)!;
      expect(i.quantidade).toBeCloseTo(numeroBR(q) * c, 8);
      expect(i.unidade).toBe(u);
      expect(i.preco).toBe(r.centavos[index]);
      expect(i.preco / 100 / i.quantidade).toBeCloseTo(
        r.centavos[index] / 100 / (numeroBR(q) * c),
        8,
      );
    });
    const restored = validarBackup(JSON.parse(JSON.stringify(db)));
    const linha = prepararLinha(restored, "bar", n, {
      ...n.itens[0],
      nome: "DESCRICAO ALTERADA",
    });
    expect(linha.insumo_id).toBe(
      db.insumos.find((i) => i.nome === itens[0][0])!.id,
    );
    expect(linha.conteudo).toBe(1.008);
    expect(
      prepararLinha(restored, "bar", { fornecedor: "Outra" }, n.itens[0])
        .insumo_id,
    ).toBeDefined(); // name suggestion still allowed
    expect(
      prepararLinha(
        restored,
        "bar",
        { fornecedor: "Outra" },
        { ...n.itens[0], nome: "OUTRO" },
      ).insumo_id,
    ).toBeUndefined();
  });
  it("lembra vínculo por descrição sem código e converte para g/ml", () => {
    const db = migrar(criarBase()),
      n = nota();
    n.itens = [n.itens[0]];
    delete n.itens[0].codigo;
    delete n.totalProdutos;
    delete n.totalNota;
    delete n.desconto;
    n.itens[0].unidade = "g";
    n.itens[0].conteudo = 1008;
    confirmarCompra(db, n);
    expect(prepararLinha(db, "bar", n, n.itens[0]).conteudo).toBe(1008);
    expect(converterConteudo(2.27, "kg", "g")).toBe(2270);
    expect(converterConteudo(3, "L", "ml")).toBe(3000);
    expect(() => converterConteudo(1, "kg", "un")).toThrow();
  });
  it("inclui frete/despesas sem aplicar desconto duas vezes", () => {
    const n = nota();
    n.frete = 10;
    n.outrasDespesas = 5;
    n.totalNota! += 15;
    n.itens[0].descontoItem = 56.46;
    expect(ratearCompra(n).centavos.reduce((s, v) => s + v, 0)).toBe(112752);
    delete n.desconto;
    expect(ratearCompra(n).total).toBe(1127.52);
  });
  it("permite editar custo unitário mantendo rateio proporcional", () => {
    const n = nota();
    const total = totalPorCusto(n, 0, 25);
    n.itens[0].total = total;
    expect(ratearCompra(n).centavos[0] / 100 / (2 * 1.008)).toBeCloseTo(25, 2);
    const single = { ...n, itens: [n.itens[0]], desconto: 5 };
    expect(totalPorCusto(single, 0, 25)).toBe(55.4);
  });
  it("não redistribui custo das linhas ignoradas para os insumos selecionados", () => {
    const n = nota(),
      antes = ratearCompra(n);
    n.itens[0].ignorar = true;
    expect(ratearCompra(n).centavos).toEqual(antes.centavos);
  });
  it("recusa divergência e conversão não revisada sem alterar dados", () => {
    for (const mutate of [
      (n: Compra) => (n.totalNota = 100),
      (n: Compra) => (n.totalProdutos = 200),
      (n: Compra) => (n.itens[1].conversaoPendente = true),
      (n: Compra) => n.itens[1].total++,
    ]) {
      const db = migrar(criarBase()),
        before = structuredClone(db),
        n = nota();
      mutate(n);
      expect(() => confirmarCompra(db, n)).toThrow();
      expect(db).toEqual(before);
    }
  });
});
function xml() {
  const n = nota();
  return `<?xml version="1.0"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe${"1".repeat(44)}"><ide><dhEmi>2026-11-15T10:00:00-03:00</dhEmi></ide><emit><CNPJ>12345678000199</CNPJ><xNome>Distribuidora &amp; Cia</xNome></emit>${n.itens.map((i) => `<det><prod><cProd>${i.codigo}</cProd><xProd>${i.nome}</xProd><uCom>${i.unidadeComercial}</uCom><qCom>${i.quantidade.toFixed(4)}</qCom><vUnCom>${i.valorUnitario.toFixed(4)}</vUnCom><vProd>${i.total.toFixed(2)}</vProd><vDesc>0.00</vDesc></prod></det>`).join("")}<total><ICMSTot><vProd>1168.98</vProd><vDesc>56.46</vDesc><vFrete>0.00</vFrete><vNF>1112.52</vNF></ICMSTot></total></infNFe></NFe></nfeProc>`;
}
describe("NF-e XML e contrato da IA", () => {
  it("lê os sete produtos, emitente, data, chave e originais sem IA", () => {
    const n = parseNFe(xml());
    expect(n.fornecedor).toBe("Distribuidora & Cia");
    expect(n.emitente).toBe("12345678000199");
    expect(n.chave).toHaveLength(44);
    expect(n.data).toBe("2026-11-15");
    expect(n.totalNota).toBe(1112.52);
    expect(n.itens).toHaveLength(7);
    expect(n.itens[0].originais.valorUnitario).toBe("19.9000");
    expect(n.itens[0].valorUnitario).toBe(19.9);
    const db = migrar(criarBase());
    const compra = compraSchema.parse({
      ...n,
      id: "xml",
      restaurante_id: "bar",
      itens: n.itens.map((i) =>
        prepararLinha(db, "bar", n, { ...i, unidade: "un" }),
      ),
    });
    expect(ratearCompra(compra).divergencia).toBe("");
    confirmarCompra(db, compra);
    expect(() => validarBackup(db)).not.toThrow();
  });
  it("aceita um único det e prefixos de namespace", () => {
    const single = xml().replace(
      /<det>[\s\S]*?<\/det>/g,
      (m, offset: number) => (offset === xml().indexOf("<det>") ? m : ""),
    );
    expect(parseNFe(single).itens).toHaveLength(1);
    expect(
      parseNFe(
        xml().replace(
          /<(\/?)(NFe|infNFe|det|prod|emit|total|ICMSTot)(?=[ >])/g,
          "<$1nfe:$2",
        ),
      ).itens,
    ).toHaveLength(7);
  });
  it("rejeita XML inválido e entidades", () => {
    for (const s of [
      "<bad>",
      "<root/>",
      '<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///etc/passwd">]><foo>&x;</foo>',
    ])
      expect(() => parseNFe(s)).toThrow();
  });
  it("exige propriedades explícitas e mantém texto original no json_schema", () => {
    expect(fiscalJsonSchema.additionalProperties).toBe(false);
    expect(fiscalJsonSchema.required).toContain("originais");
    expect(fiscalJsonSchema.required).toContain("totalNota");
  });
});
