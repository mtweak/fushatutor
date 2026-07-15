import { NextResponse } from "next/server";
import { z } from "zod";
import { continueLearningThread, createLearningThread } from "@/lib/orchestrator";
import { getThreads, saveSignal, saveThread } from "@/lib/db";
import type { InteractionSignal } from "@/lib/types";
import { DEFAULT_CONVERSATION_ID } from "@/lib/conversation-context";

export const runtime = "nodejs";

const schema = z.object({
  conversationId: z.string().min(1).default(DEFAULT_CONVERSATION_ID),
  turnId: z.string().default("realtime-tool"),
  type: z.enum(["explicit_learning_request", "failed_communicative_attempt", "lexical_gap", "construction_attempt", "meaning_uncertainty", "topic_interest"]),
  targetText: z.string().optional(),
  intendedMeaning: z.string().optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const signal: InteractionSignal = {
    id: `signal-${crypto.randomUUID()}`,
    ...parsed.data,
    confidence: 0.92,
    explicitness: parsed.data.type === "explicit_learning_request" ? 1 : 0.72,
    persistence: 0.68,
    sourceRelevance: 0.4,
    detectedAt: new Date().toISOString(),
  };
  saveSignal(signal);
  const normalizedTarget = normalize(signal.targetText);
  const existing = normalizedTarget
    ? getThreads(signal.conversationId).find((thread) => !["completed", "expired"].includes(thread.status) && normalize(thread.targetArabic) === normalizedTarget)
    : undefined;
  const thread = existing ? continueLearningThread(existing, signal) : createLearningThread(signal);
  saveThread(thread);
  return NextResponse.json({ signal, thread }, { status: 201 });
}

function normalize(value?: string): string {
  return (value || "").replace(/[ًٌٍَُِّْـ\s،؟?.!]/g, "").toLowerCase();
}
