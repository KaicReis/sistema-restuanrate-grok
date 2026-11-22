import { describe, expect, it } from "vitest";
import { taxaCanal } from "../src/lib/dna";
import { resumirFluxoCaixa } from "../src/lib/fluxo-caixa";
import { mesclarDados } from "../src/lib/import-data";
import { alterarVencimentoCompra, confirmarCompra, type Compra } from "../src/lib/purchases";
import { validarBackup } from "../src/lib/storage";
import { criarBase, novosCanais } from "../src/lib/storage/seed";

const compra: Compra = {
  id: "compra",
  restaurante_id: "bar",
  fornecedor: "Mercado",
  data: "2026-11-14",
  totalNota: 19.98,
  desconto: 0.02,
  itens: [{ nome: "Tomate", quantidade: 2, unidade: "kg", valorUnitario: 10, total: 20 }],
};

describe("condições de recebimento por canal", () => {
  it("preserva taxa e prazo zero no backup sem somar as alternativas à taxa de precificação", () => {
    const db = criarBase();
    const canal = novosCanais("bar", "2026-11")[0];
    const percentualOriginal = taxaCanal(canal);
    canal.recebimentos = [
      { id: "pix", forma: "Pix", percentual: 0, dias: 0 },
      { id: "visa", forma: "Crédito", bandeira: "Visa", percentual: 3.45, dias: 30 },
    ];
    db.canais.push(canal);
    expect(validarBackup(JSON.parse(JSON.stringify(db))).canais.at(-1)?.recebimentos)
      .toEqual(canal.recebimentos);
    expect(taxaCanal(canal)).toBe(percentualOriginal);
    canal.recebimentos.push({ id: "visa2", forma: " credito ", bandeira: " VISA ", percentual: 4, dias: 31 });
    expect(() => validarBackup(db)).toThrow();
  });
});

describe("vencimento da compra no fluxo de caixa", () => {
  it("programa o total da nota na data do vencimento e rejeita datas inválidas antes de atualizar o estoque", () => {
    const db = criarBase();
    const original = structuredClone(db);
    expect(() => confirmarCompra(db, compra, false, "2026-11-31")).toThrow("vencimento válida");
    expect(db).toEqual(original);
    confirmarCompra(db, compra, false, "2026-12-02");
    expect(() => confirmarCompra(db, compra, false, "2026-12-02")).toThrow("já confirmada");
    const movimentos = validarBackup(JSON.parse(JSON.stringify(db))).movimentosCaixa ?? [];
    expect(movimentos).toHaveLength(1);
    expect(movimentos[0]).toMatchObject({
      compra_id: compra.id,
      restaurante_id: "bar",
      data: "2026-12-02",
      vencimento: "2026-12-02",
      tipo: "saida",
      categoria: "Fornecedores",
      situacao: "previsto",
      valorCentavos: 1998,
    });
    expect(resumirFluxoCaixa([], movimentos, ["bar"], "2026-12", "2026-11-22").previstos.saida)
      .toBe(1998);
  });

  it("permite agendar, reagendar e retirar o vencimento de compras em aberto", () => {
    const db = criarBase();
    confirmarCompra(db, compra);
    expect(db.movimentosCaixa ?? []).toHaveLength(0);
    alterarVencimentoCompra(db, compra.id, "2026-12-02");
    const movimento = db.movimentosCaixa?.[0];
    alterarVencimentoCompra(db, compra.id, "2026-12-05");
    expect(db.movimentosCaixa).toEqual([
      expect.objectContaining({ id: movimento?.id, data: "2026-12-05", vencimento: "2026-12-05" }),
    ]);
    alterarVencimentoCompra(db, compra.id);
    expect(db.movimentosCaixa).toEqual([]);
    expect(db.compras).toHaveLength(1);
  });

  it("preserva o pagamento efetivo ao editar vencimentos ou mesclar um backup pendente", () => {
    const db = criarBase();
    confirmarCompra(db, compra);
    const backup = structuredClone(db);
    alterarVencimentoCompra(backup, compra.id, "2026-12-02");
    alterarVencimentoCompra(db, compra.id, "2026-12-04");
    const movimento = db.movimentosCaixa![0];
    movimento.situacao = "realizado";
    movimento.data = "2026-12-03";
    expect(() => alterarVencimentoCompra(db, compra.id)).toThrow("já foi paga");
    expect(() => alterarVencimentoCompra(db, compra.id, "2026-12-07")).toThrow("já foi paga");
    expect(validarBackup(mesclarDados(db, backup)).movimentosCaixa).toEqual([movimento]);
    expect(validarBackup(mesclarDados(backup, db)).movimentosCaixa).toEqual([movimento]);
  });
});
