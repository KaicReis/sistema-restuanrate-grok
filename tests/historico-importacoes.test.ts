import { describe, expect, it } from "vitest";
import { compactarBackup, compactarHistorico, LIMITE_BYTES_SINCRONIZACAO, MAX_BYTES_IMPORTACOES, MAX_IMPORTACOES } from "../src/lib/historico-importacoes";
import { mesclarDados } from "../src/lib/import-data";
import { validarBackup } from "../src/lib/storage";
import { migrar } from "../src/lib/storage/migrate";
import { criarBase } from "../src/lib/storage/seed";

describe("histórico de importação", () => {
  it("achata ambos os históricos e preserva dados legados fora do histórico", () => {
    const primeira = { data: { preco: 100, nome: "A" }, criadoEm: "2026-01-01" };
    const segunda = {
      data: { nome: "A", preco: 100, importacoes: [primeira] },
      criadoEm: "2026-02-01",
    };
    const antes = migrar(criarBase());
    antes.importacoes = [primeira];
    const recebido = structuredClone(antes);
    recebido.restaurantes[0].nome = "Alterado";
    recebido.importacoes = [segunda];
    const depois = mesclarDados(antes, recebido);
    expect(depois.restaurantes[0].nome).toBe("Alterado");
    expect(depois.legadoV1).toEqual(antes.legadoV1);
    expect(depois.importacoes).toHaveLength(3);
    expect(depois.importacoes?.[0]).toEqual({ data: { preco: 100, nome: "A" }, criadoEm: "2026-02-01" });
    expect(depois.importacoes?.every(({ data }) => !Object.hasOwn(data as object, "importacoes"))).toBe(true);

    // A mesma importação não recria as versões de origem e destino.
    const segundaMesclagem = mesclarDados(depois, recebido);
    const terceiraMesclagem = mesclarDados(segundaMesclagem, recebido);
    expect(terceiraMesclagem.importacoes?.length).toBe(segundaMesclagem.importacoes?.length);
  });

  it("normaliza backups antigos sem mudar os cadastros ativos", () => {
    const db = migrar(criarBase());
    const legado = { ...db.legadoV1 as object, importacoes: [{ data: { antigo: true }, criadoEm: "2026-01-01" }] };
    const backup = { ...db, legadoV1: legado };
    const normalizado = validarBackup(backup);
    expect(normalizado.legadoV1).toEqual(db.legadoV1);
    expect(normalizado.restaurantes).toEqual(db.restaurantes);
    expect(normalizado.insumos).toEqual(db.insumos);
    expect(normalizado.importacoes).toEqual(legado.importacoes);
    expect(validarBackup(normalizado)).toEqual(normalizado);
    expect(backup.legadoV1.importacoes).toHaveLength(1);
  });

  it("limita quantidade e bytes reais sem truncar nenhuma cópia", () => {
    const historico = Array.from({ length: 20 }, (_, n) => ({
      data: { n, texto: "A" }, criadoEm: `2026-01-${String(n + 1).padStart(2, "0")}`,
    }));
    expect(compactarHistorico(historico).map(({ data }) => data)).toEqual(historico.slice(-MAX_IMPORTACOES).map(({ data }) => data));
    const caros = historico.map(({ data, criadoEm }) => ({ data: { ...data, texto: "é".repeat(200_000) }, criadoEm }));
    const db = { ...migrar(criarBase()), importacoes: caros };
    const comprimido = compactarBackup(db).importacoes ?? [];
    expect(comprimido).toEqual(caros.slice(-3));
    expect(new TextEncoder().encode(JSON.stringify(comprimido)).byteLength).toBeLessThanOrEqual(MAX_BYTES_IMPORTACOES);
  });

  it("faz o histórico caber ao lado do documento ativo sem alterar suas coleções", () => {
    const db = {
      ...migrar(criarBase()),
      legadoV1: { texto: "á".repeat(1_700_000) },
      importacoes: [
        { data: { texto: "á".repeat(300_000) }, criadoEm: "2026-01-02" },
        { data: { texto: "á".repeat(100_000) }, criadoEm: "2026-01-01" },
      ],
    };
    const resultado = compactarBackup(db);
    expect(resultado.legadoV1).toEqual(db.legadoV1);
    expect(resultado.insumos).toEqual(db.insumos);
    expect(resultado.importacoes).toEqual([db.importacoes[1]]);
    expect(new TextEncoder().encode(JSON.stringify({ data: resultado, revision: 1 })).byteLength)
      .toBeLessThanOrEqual(LIMITE_BYTES_SINCRONIZACAO);
  });
});
