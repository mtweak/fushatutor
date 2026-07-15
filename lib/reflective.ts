import "server-only";

import { glossArabic } from "@/lib/arabic";
import { analyzeTurn } from "@/lib/orchestrator";
import type { GlossToken, TurnAnalysis, TurnMetrics, VocabularyItem } from "@/lib/types";

export async function reflectiveTurnAnalysis(input: {
  conversationId: string;
  turnId: string;
  transcript: string;
  metrics?: TurnMetrics;
  recentLearnerTurns?: string[];
  vocabulary?: VocabularyItem[];
  sourceTerms?: string[];
}): Promise<TurnAnalysis> {
  const local = analyzeTurn(input);
  const localWithAlignment: TurnAnalysis = {
    ...local,
    vocalizedTranscript: input.transcript,
    glosses: glossArabic(input.transcript),
  };
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return localWithAlignment;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_REFLECTIVE_MODEL || "gpt-5.6-terra",
        reasoning: { effort: "low" },
        input: `You are the reflective loop for a conversation-first Fuṣḥā speaking tutor. Return one JSON object with exactly these fields:
- suggestedReply: 1–2 natural, fully vowelled Fuṣḥā sentences that respond to the learner's meaning and continue the topic with at most one low-pressure question.
- vocalizedTranscript: the learner's same wording with tashkīl added to Arabic words; do not silently rewrite the learner.
- glosses: an array with one object per Arabic word: {"arabic":"...","english":"short contextual gloss","root":"optional root letters"}.
- learningTargetArabic: the concise, fully vowelled Arabic word, phrase, or construction the learner is reaching for; use an empty string when there is no new learning target.

Meaning and conversational momentum outrank language accuracy. If the learner is understandable, do not correct, evaluate, explain, or recast the wording. Never ask for repetition unless the learner explicitly requested language practice or a repeated gap is blocking communication. If overloaded, preserve the topic while shortening the Arabic or offering one simple choice. Follow explicit learner curiosity. Do not quote Qur'an.

Learner transcript: ${input.transcript}
Local orchestration action: ${local.decision.action}
Local reason: ${local.decision.reason}
Local proposed reply: ${local.suggestedReply}`,
        text: {
          format: {
            type: "json_schema",
            name: "fusha_turn_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                suggestedReply: { type: "string" },
                vocalizedTranscript: { type: "string" },
                learningTargetArabic: { type: "string" },
                glosses: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      arabic: { type: "string" },
                      english: { type: "string" },
                      root: { anyOf: [{ type: "string" }, { type: "null" }] },
                    },
                    required: ["arabic", "english", "root"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["suggestedReply", "vocalizedTranscript", "learningTargetArabic", "glosses"],
              additionalProperties: false,
            },
          },
        },
        max_output_tokens: 300,
      }),
    });
    if (!response.ok) return localWithAlignment;
    const data = (await response.json()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
    };
    const text = data.output_text ?? data.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("");
    if (!text) return localWithAlignment;
    const parsed = parseReflectiveJson(text);
    const decision = parsed.learningTargetArabic && local.decision.thread
      ? { ...local.decision, thread: { ...local.decision.thread, targetArabic: parsed.learningTargetArabic } }
      : local.decision;
    return {
      ...localWithAlignment,
      decision,
      suggestedReply: parsed.suggestedReply || local.suggestedReply,
      vocalizedTranscript: parsed.vocalizedTranscript || localWithAlignment.vocalizedTranscript,
      glosses: parsed.glosses?.length ? parsed.glosses : localWithAlignment.glosses,
      learningTargetArabic: parsed.learningTargetArabic || undefined,
    };
  } catch {
    return localWithAlignment;
  }
}

function parseReflectiveJson(text: string): {
  suggestedReply?: string;
  vocalizedTranscript?: string;
  learningTargetArabic?: string;
  glosses?: GlossToken[];
} {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned) as {
    suggestedReply?: unknown;
    vocalizedTranscript?: unknown;
    learningTargetArabic?: unknown;
    glosses?: unknown;
  };
  const glosses = Array.isArray(parsed.glosses)
    ? parsed.glosses
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .filter((item) => typeof item.arabic === "string" && typeof item.english === "string")
        .map((item) => ({
          arabic: String(item.arabic),
          english: String(item.english),
          root: typeof item.root === "string" ? item.root : undefined,
        }))
    : undefined;
  return {
    suggestedReply: typeof parsed.suggestedReply === "string" ? parsed.suggestedReply : undefined,
    vocalizedTranscript: typeof parsed.vocalizedTranscript === "string" ? parsed.vocalizedTranscript : undefined,
    learningTargetArabic: typeof parsed.learningTargetArabic === "string" ? parsed.learningTargetArabic : undefined,
    glosses,
  };
}
