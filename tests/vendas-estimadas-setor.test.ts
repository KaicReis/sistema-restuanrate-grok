import { expect, it } from "vitest";
import { mesclarDados } from "../src/lib/import-data";
import { validarBackup } from "../src/lib/storage";
import { criarBase } from "../src/lib/storage/seed";
import { vendaSetorEstimadaMensalSchema, type VendaSetorEstimadaMensal } from "../src/lib/vendas-estimadas-setor";

const outubro: VendaSetorEstimadaMensal = {
  competencia: "2026-10",
  unidadesNoArquivo: 100,
  setores: [
    { restaurante_id: "nativos", unidades: 50, valor: 290_000 },
    { restaurante_id: "bora", unidades: 30, valor: 140_000 },
  ],
};

it("preserva estimativas mensais no backup e atualiza apenas a competência recebida", () => {
  const base = criarBase();
  const setembro = { ...outubro, competencia: "2026-09" };
  const revisao = { ...outubro, unidadesNoArquivo: 110, unidadesExcluidas: 25, relatorioParcial: true };
  const mesclado = mesclarDados(
    { ...base, vendasSetoresEstimadas: [setembro, outubro] },
    { ...base, vendasSetoresEstimadas: [revisao] },
  );
  expect(validarBackup(JSON.parse(JSON.stringify(mesclado))).vendasSetoresEstimadas)
    .toEqual([setembro, revisao]);
  expect(mesclarDados(mesclado, base).vendasSetoresEstimadas)
    .toEqual([setembro, revisao]);
});

it("valida integridade de competência, unidades e operação", () => {
  const base = criarBase();
  expect(vendaSetorEstimadaMensalSchema.safeParse(outubro).success).toBe(true);
  expect(vendaSetorEstimadaMensalSchema.safeParse({ ...outubro, relatorioParcial: "true" }).success).toBe(false);
  expect(vendaSetorEstimadaMensalSchema.safeParse({ ...outubro, unidadesExcluidas: 21 }).success).toBe(false);
  expect(vendaSetorEstimadaMensalSchema.safeParse({
    ...outubro, unidadesNoArquivo: 70,
  }).success).toBe(false);
  expect(vendaSetorEstimadaMensalSchema.safeParse({
    ...outubro, setores: [outubro.setores[0], outubro.setores[0]],
  }).success).toBe(false);
  expect(() => validarBackup({ ...base, vendasSetoresEstimadas: [outubro, outubro] }))
    .toThrow();
  expect(() => validarBackup({
    ...base,
    vendasSetoresEstimadas: [{ ...outubro, setores: [{ ...outubro.setores[0], restaurante_id: "a-vila" }] }],
  })).toThrow("Estimativa de vendas sem setor válido");
});
