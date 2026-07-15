import { NextResponse } from "next/server";
import { z } from "zod";
import { glossArabic } from "@/lib/arabic";
import { addTurn, getSources, getTurns, getVocabulary, persistTurnAnalysis, saveTurnMetrics } from "@/lib/db";
import { reflectiveTurnAnalysis } from "@/lib/reflective";
import type { ConversationTurn } from "@/lib/types";
import { DEFAULT_CONVERSATION_ID } from "@/lib/conversation-context";

export const runtime = "nodejs";

const schema = z.object({
  conversationId: z.string().min(1).default(DEFAULT_CONVERSATION_ID),
  id: z.string().min(1).optional(),
  transcript: z.string().trim().min(1),
  role: z.enum(["learner", "tutor"]).default("learner"),
  mode: z.enum(["realtime", "demo", "text"]).default("text"),
  metrics: z
    .object({
      responseOnsetMs: z.number().nonnegative().optional(),
      speechDurationMs: z.number().nonnegative().optional(),
      pauseRatio: z.number().min(0).max(1).optional(),
      midClausePauses: z.number().int().nonnegative().optional(),
      repairCount: z.number().int().nonnegative().optional(),
      interruptedTutor: z.boolean().optional(),
      asrConfidence: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const id = parsed.data.id || `turn-${crypto.randomUUID()}`;
  const turn: ConversationTurn = {
    id,
    conversationId: parsed.data.conversationId,
    role: parsed.data.role,
    arabic: parsed.data.transcript,
    glosses: glossArabic(parsed.data.transcript),
    createdAt: new Date().toISOString(),
  };

  if (turn.role === "tutor") {
    persistTurnAnalysis(turn, {
      signals: [],
      engagement: {
        engagementProbability: 0.5,
        boredomProbability: 0.1,
        overloadProbability: 0.1,
        fatigueProbability: 0.08,
        challengeLevel: 0.5,
        confidence: 0.2,
        supportingSignals: [],
        windowStartTurnId: id,
        windowEndTurnId: id,
      },
      decision: { action: "continue_flow", reason: "Tutor output persisted." },
      suggestedReply: "",
      vocabularyEvidence: [],
    });
    saveTurnMetrics(turn.id, turn.conversationId, "tutor", { speechDurationMs: parsed.data.metrics?.speechDurationMs ?? estimateSpeechDuration(turn.arabic) }, parsed.data.mode);
    return NextResponse.json({ turn });
  }

  const sources = getSources(turn.conversationId);
  const recentLearnerTurns = getTurns(turn.conversationId)
    .filter((item) => item.role === "learner")
    .slice(-4)
    .map((item) => item.arabic);
  const sourceTerms = sources.flatMap((source) => source.passages.flatMap((passage) => passage.concepts));
  const analysis = await reflectiveTurnAnalysis({
    conversationId: turn.conversationId,
    turnId: id,
    transcript: turn.arabic,
    metrics: parsed.data.metrics,
    recentLearnerTurns,
    vocabulary: getVocabulary(),
    sourceTerms,
  });
  if (analysis.vocalizedTranscript) turn.arabic = analysis.vocalizedTranscript;
  if (analysis.glosses?.length) turn.glosses = analysis.glosses;
  persistTurnAnalysis(turn, analysis);
  saveTurnMetrics(turn.id, turn.conversationId, "learner", parsed.data.metrics, parsed.data.mode);

  if (parsed.data.mode === "realtime") {
    return NextResponse.json({ turn, analysis });
  }

  const tutorTurn: ConversationTurn = {
    id: `turn-${crypto.randomUUID()}`,
    conversationId: turn.conversationId,
    role: "tutor",
    arabic: analysis.suggestedReply,
    glosses: glossArabic(analysis.suggestedReply),
    createdAt: new Date(Date.now() + 1).toISOString(),
    sourceStatus: "illustrative_only",
  };
  addTurn(tutorTurn);
  saveTurnMetrics(tutorTurn.id, tutorTurn.conversationId, "tutor", { speechDurationMs: estimateSpeechDuration(tutorTurn.arabic) }, parsed.data.mode);
  return NextResponse.json({ turn, tutorTurn, analysis });
}

function estimateSpeechDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(900, Math.round((words / 2.2) * 1_000));
}
