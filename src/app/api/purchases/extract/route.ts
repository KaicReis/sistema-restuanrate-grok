import { validarNota } from "@/lib/purchase-validation";
import { database } from "@/lib/server/db";
import { attempts } from "@/lib/server/schema";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { currentUser, sameOrigin, tokenHash } from "@/lib/server/auth";
import { compraSchema, extrairEmbalagem } from "@/lib/purchases";
import {
  fiscalInstruction,
  fiscalJsonSchema,
  parseNFe,
} from "@/lib/server/fiscal";
import pdf from "pdf-parse/lib/pdf-parse.js";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  // Sem banco, a funcionalidade local continua disponível, mas a API paga exige login.
  const user = process.env.DATABASE_URL ? await currentUser() : null;
  if (!user)
    return NextResponse.json(
      { error: "Entre em uma conta com banco configurado para ler notas." },
      { status: 401 },
    );
  try {
    if (Number(request.headers.get("content-length")) > 4 * 1024 * 1024)
      throw new Error("Arquivo deve ter até 3 MB");
    const form = await request.formData(),
      file = form.get("photo"),
      qr = form.get("qr");
    if (file instanceof File) {
      if (file.size > 3 * 1024 * 1024) throw new Error("Arquivo deve ter até 3 MB. Prepare a foto antes de enviar.");
      if (!["image/jpeg", "image/png", "image/webp", "application/pdf", "application/xml", "text/xml"].includes(file.type) && !/\.(xml|pdf)$/i.test(file.name))
        throw new Error("Formato não suportado. Use JPG, PNG, WebP, PDF ou XML até 3 MB.");
    } else if (typeof qr !== "string") throw new Error("Envie uma foto ou URL do QR Code.");
    let content: Record<string, unknown>[];
    const instruction = fiscalInstruction;
    if (file instanceof File) {
      const buffer = Buffer.from(await file.arrayBuffer());
      if (
        /\.xml$/i.test(file.name) ||
        ["application/xml", "text/xml"].includes(file.type)
      ) {
        return NextResponse.json({ nota: parseNFe(buffer.toString("utf8")) });
      }
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        const parsed = await pdf(Uint8Array.from(buffer), { max: 50 });
        if (parsed.numpages > 50 || parsed.text.length > 80000)
          throw new Error("PDF muito extenso. Divida a nota ou envie o XML.");
        if (!parsed.text.trim())
          throw new Error(
            "PDF sem texto. Envie uma foto das páginas ou o XML da NF-e.",
          );
        content = [
          {
            type: "text",
            text: instruction + "\nDANFE:\n" + parsed.text.slice(0, 80000),
          },
        ];
      } else {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
          throw new Error("Use JPG, PNG, WebP, PDF ou XML até 3 MB.");
        content = [
          { type: "text", text: instruction },
          {
            type: "image_url",
            image_url: {
              detail: "high",
              url: `data:${file.type};base64,${buffer.toString("base64")}`,
            },
          },
        ];
      }
    } else if (typeof qr === "string") {
      const url = new URL(qr);
      // Lista fechada de portais fiscais; não segue redirecionamentos nem URLs arbitrárias.
      const hosts = [
        "nfe.sefaz.ba.gov.br",
        "www.sefaz.ba.gov.br",
        "nfce.sefaz.ba.gov.br",
        "www.fazenda.pr.gov.br",
        "www.nfce.fazenda.sp.gov.br",
        "nfce.fazenda.mg.gov.br",
        "www.sefaz.rs.gov.br",
      ];
      if (
        url.protocol !== "https:" ||
        url.port ||
        url.username ||
        url.password ||
        !hosts.includes(url.hostname)
      )
        throw new Error("Portal NFC-e não suportado. Use a foto da nota.");
      const fiscal = await fetch(url, {
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (!fiscal.ok)
        throw new Error("Portal fiscal indisponível. Use a foto.");
      const reader = fiscal.body!.getReader();
      let html = "";
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 1024 * 1024) {
          await reader.cancel();
          throw new Error("Resposta fiscal muito grande");
        }
        html += new TextDecoder().decode(value);
      }
      content = [
        {
          type: "text",
          text:
            instruction +
            "\nDocumento fiscal:\n" +
            html
              .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
              .replace(/<[^>]+>/g, " ")
              .slice(0, 80000),
        },
      ];
    } else throw new Error("Envie uma foto ou URL do QR Code.");
    if (!process.env.OPENAI_API_KEY)
      throw new Error(
        "Configure OPENAI_API_KEY na Vercel para fotos e PDFs. XML dispensa IA.",
      );
    const [limit] = await database()
      .insert(attempts)
      .values({
        key: tokenHash("extract:" + user.id),
        count: 1,
        expires: new Date(Date.now() + 3600000),
      })
      .onConflictDoUpdate({
        target: attempts.key,
        set: {
          count: sql`CASE WHEN ${attempts.expires} < now() THEN 1 ELSE ${attempts.count}+1 END`,
          expires: sql`CASE WHEN ${attempts.expires} < now() THEN now()+interval '1 hour' ELSE ${attempts.expires} END`,
        },
      })
      .returning();
    if (limit.count > 30)
      return NextResponse.json(
        { error: "Limite de 30 leituras por hora atingido. Tente mais tarde." },
        { status: 429 },
      );
    const extract = async (model: string, feedback?: string) => {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: feedback ? [...content, { type: "text", text: feedback }] : content }],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "nota_fiscal",
              strict: true,
              schema: fiscalJsonSchema,
            },
          },
          max_tokens: 16000,
          temperature: 0,
        }),
        signal: AbortSignal.timeout(45000),
      });
      if (!response.ok)
        throw new Error(
          "Não foi possível ler a nota na OpenAI. Verifique a chave, créditos e tente novamente.",
        );
      const result = await response.json();
      const choice = result.choices?.[0];
      if (
        !choice?.message?.content ||
        choice.message.refusal ||
        choice.finish_reason === "length"
      )
        throw new Error("Leitura incompleta. Envie outra foto ou o XML da NF-e.");
      return JSON.parse(choice.message.content);
    };
    let extracted = await extract(process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini");
    let validacao = validarNota(extracted);
    if (validacao.linhas.length) {
      try {
        const fallback = await extract(process.env.OPENAI_VISION_FALLBACK_MODEL || "gpt-4.1",
          "Releia o documento original. A leitura anterior apresentou divergências: " +
          validacao.linhas.map(l => l.mensagem).join("; ") +
          ". Extraia novamente todos os campos, sem inventar ou ajustar valores para forçar as contas.");
        const segunda = validarNota(fallback);
        if (segunda.valido) { extracted = fallback; validacao = segunda; }
      } catch { /* Keep the first editable result if the single retry fails. */ }
    }
    // Campos incertos permanecem editáveis na revisão, nunca são confirmados automaticamente.
    const checked = compraSchema
      .partial({ fornecedor: true, data: true })
      .safeParse({
        ...extracted,
        id: "preview",
        restaurante_id: "preview",
        itens: extracted.itens?.map(
          (i: { nome: string; unidadeComercial: string }) => ({
            ...i,
            ...extrairEmbalagem(i.nome ?? "", i.unidadeComercial ?? ""),
          }),
        ),
      });
    return NextResponse.json({ nota: extracted, validacao, pendente: !checked.success || !validacao.valido });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Não foi possível ler a nota.",
      },
      { status: 422 },
    );
  }
}
