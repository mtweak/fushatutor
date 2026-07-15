import { NextResponse } from "next/server";
import { z } from "zod";
import { glossArabic, needsGlossLookup } from "@/lib/arabic";
import type { GlossToken } from "@/lib/types";

export const runtime = "nodejs";

const schema = z.object({
  word: z.string().trim().min(1).max(80).refine((value) => /[\u0600-\u06ff]/.test(value), "An Arabic word is required."),
  context: z.string().trim().max(1_000).optional().default(""),
});

const cache = new Map<string, GlossToken>();

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "An Arabic word is required." }, { status: 400 });

  const localGloss = glossArabic(parsed.data.word)[0];
  if (localGloss && !needsGlossLookup(localGloss)) return NextResponse.json({ gloss: localGloss, source: "local" });

  const cacheKey = `${parsed.data.word}\n${parsed.data.context}`;
  const cached = cache.get(cacheKey);
  if (cached) return NextResponse.json({ gloss: cached, source: "cache" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "English meanings require an OpenAI API key." }, { status: 503 });

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_GLOSS_MODEL || "gpt-5-mini",
        reasoning: { effort: "minimal" },
        instructions: `Give a concise contextual English gloss for one Arabic surface word. Prefer its classical or literary Fuṣḥā sense, while respecting the supplied sentence. Explain attached particles or pronouns as part of the surface form. The English meaning should be 2–10 words, with no transliteration. Return the triliteral or quadriliteral root as Arabic letters separated by spaces, or null for particles and proper nouns.`,
        input: JSON.stringify({ word: parsed.data.word, sentence: parsed.data.context }),
        text: {
          format: {
            type: "json_schema",
            name: "arabic_contextual_gloss",
            strict: true,
            schema: {
              type: "object",
              properties: {
                english: { type: "string" },
                root: { anyOf: [{ type: "string" }, { type: "null" }] },
              },
              required: ["english", "root"],
              additionalProperties: false,
            },
          },
        },
        max_output_tokens: 180,
      }),
    });
    if (!response.ok) return NextResponse.json({ error: "The contextual meaning could not be generated." }, { status: 502 });

    const data = await response.json() as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
    };
    const outputText = data.output_text ?? data.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("");
    if (!outputText) return NextResponse.json({ error: "The contextual meaning was empty." }, { status: 502 });
    const result = JSON.parse(outputText) as { english?: unknown; root?: unknown };
    if (typeof result.english !== "string" || !result.english.trim()) {
      return NextResponse.json({ error: "The contextual meaning was invalid." }, { status: 502 });
    }

    const gloss: GlossToken = {
      arabic: parsed.data.word,
      english: result.english.trim(),
      root: typeof result.root === "string" && result.root.trim() ? result.root.trim() : undefined,
    };
    if (cache.size >= 500) cache.delete(cache.keys().next().value ?? "");
    cache.set(cacheKey, gloss);
    return NextResponse.json({ gloss, source: "generated" });
  } catch {
    return NextResponse.json({ error: "The contextual meaning could not be generated." }, { status: 502 });
  }
}
