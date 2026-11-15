import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/lib/server/auth", () => ({
  currentUser: async () => ({ id: "test" }),
  sameOrigin: () => true,
  tokenHash: () => "test",
}));
vi.mock("../src/lib/server/db", () => ({
  database: () => ({
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({ returning: async () => [{ count: 1 }] }),
      }),
    }),
  }),
}));
import { POST } from "../src/app/api/purchases/extract/route";
import { readFileSync } from "node:fs";
const pdf = (name: string) =>
  new Uint8Array(
    readFileSync(new URL(`./fixtures/${name}.pdf`, import.meta.url)),
  );
const request = (
  data: string | Uint8Array<ArrayBuffer>,
  name: string,
  type: string,
) => {
  const form = new FormData();
  form.set("photo", new File([data], name, { type }));
  return new Request("http://localhost/api/purchases/extract", {
    method: "POST",
    body: form,
  });
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("API de extração", () => {
  it("extrai texto de PDF no servidor e pede json_schema com originais", async () => {
    vi.stubEnv("DATABASE_URL", "configured");
    vi.stubEnv("OPENAI_API_KEY", "test");
    const fetchMock = vi.fn(async () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                fornecedor: "Distribuidora",
                itens: [],
              }),
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(
      request(pdf("danfe-texto"), "danfe.pdf", "application/pdf"),
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string,
    );
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.messages[0].content).toHaveLength(1);
    expect(body.messages[0].content[0].text).toContain(
      "HEINZ 144/7G CX 2,00 19,9000 39,80",
    );
  });
  it("lê XML mesmo sem chave OpenAI e sem requisição externa", async () => {
    vi.stubEnv("DATABASE_URL", "configured");
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const xml =
      '<NFe><infNFe Id="NFe123"><emit><xNome>Teste</xNome></emit><ide><dEmi>2026-11-15</dEmi></ide><det><prod><cProd>01</cProd><xProd>BATATA 6 X 2,5KG</xProd><uCom>CX</uCom><qCom>1.0000</qCom><vUnCom>316.0000</vUnCom><vProd>316.00</vProd></prod></det><total><ICMSTot><vProd>316.00</vProd><vNF>316.00</vNF></ICMSTot></total></infNFe></NFe>';
    const response = await POST(request(xml, "nfe.xml", "application/xml"));
    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    const { nota } = await response.json();
    expect(nota.itens[0].codigo).toBe("01");
    expect(nota.itens[0].valorUnitario).toBe(316);
  });
  it("recusa PDF sem texto e não chama IA", async () => {
    vi.stubEnv("DATABASE_URL", "configured");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(
      request(pdf("danfe-sem-texto"), "sem-texto.pdf", "application/pdf"),
    );
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain("PDF sem texto");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
