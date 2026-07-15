import { describe, expect, it } from "vitest";
import { analyzeTurn, continueLearningThread, decideNextAction, detectSignals, estimateEngagement } from "@/lib/orchestrator";
import type { EngagementState, InteractionSignal, LearningThread } from "@/lib/types";

describe("real-time orchestration", () => {
  it("follows an explicit language request immediately", () => {
    const signals = detectSignals({
      conversationId: "conversation-a",
      turnId: "turn-1",
      transcript: "كَيْفَ أَقُولُ it seems to me بِالْعَرَبِيَّةِ؟",
      metrics: { asrConfidence: 0.9 },
    });
    const engagement = estimateEngagement("turn-1", signals, { asrConfidence: 0.9 });
    const decision = decideNextAction(signals, engagement);
    expect(signals.map((signal) => signal.type)).toContain("explicit_learning_request");
    expect(signals.map((signal) => signal.type)).toContain("lexical_gap");
    expect(decision.action).toBe("follow_now");
    expect(decision.thread?.status).toBe("active");
  });

  it("does not infer boredom from one short answer", () => {
    const signals = detectSignals({ conversationId: "conversation-a", turnId: "turn-2", transcript: "نَعَمْ", recentLearnerTurns: [] });
    expect(signals.map((signal) => signal.type)).not.toContain("possible_boredom");
  });

  it("raises novelty only after a run of fast short answers", () => {
    const result = analyzeTurn({
      conversationId: "conversation-a",
      turnId: "turn-3",
      transcript: "نَعَمْ",
      recentLearnerTurns: ["نَعَمْ", "صَحِيحٌ"],
      metrics: { responseOnsetMs: 700, asrConfidence: 0.92 },
    });
    expect(result.signals.map((signal) => signal.type)).toContain("possible_boredom");
    expect(result.decision.action).toBe("raise_novelty");
  });

  it("reduces load when several struggle cues agree", () => {
    const result = analyzeTurn({
      conversationId: "conversation-a",
      turnId: "turn-4",
      transcript: "أَقْصِدُ... I mean... الْمَقَامَ",
      metrics: { responseOnsetMs: 6_100, midClausePauses: 4, repairCount: 3, asrConfidence: 0.9 },
    });
    expect(result.engagement.overloadProbability).toBeGreaterThanOrEqual(0.68);
    expect(result.decision.action).toBe("reduce_load");
    expect(result.decision.difficultyAxis).toBe("support");
    expect(result.suggestedReply).not.toContain("أَكْمِلْ");
  });

  it("responds to a repaired greeting without turning it into a correction drill", () => {
    const result = analyzeTurn({
      conversationId: "conversation-a",
      turnId: "turn-5",
      transcript: "السَّلَامُ... أَهْلًا",
      metrics: { repairCount: 2, asrConfidence: 0.9 },
    });
    expect(result.signals.map((signal) => signal.type)).toContain("failed_communicative_attempt");
    expect(result.decision.action).toBe("continue_flow");
    expect(result.suggestedReply).toContain("وَعَلَيْكُمُ السَّلَامُ");
    expect(result.suggestedReply).not.toContain("لِنُجَرِّبْهَا");
  });

  it("accepts an understandable imperfect sentence and continues its meaning", () => {
    const result = analyzeTurn({
      conversationId: "conversation-a",
      turnId: "turn-conversation-first",
      transcript: "أَنَا أَمْسِ يَذْهَبُ إِلَى الدَّرْسِ",
      metrics: { asrConfidence: 0.9 },
    });

    expect(result.decision.action).toBe("continue_flow");
    expect(result.suggestedReply).toContain("فَهِمْتُ مَقْصِدَكَ");
    expect(result.suggestedReply).not.toMatch(/الصَّحِيحُ|أَعِدْ|قُلْ|أَكْمِلْ/);
  });

  it("bookmarks a useful detour while preserving a productive thought", () => {
    const decision = decideNextAction([signal("topic_interest", { sourceRelevance: 0.2 })], calmEngagement(), { preserveCurrentThought: true });
    expect(decision.action).toBe("bookmark");
    expect(decision.thread?.status).toBe("bookmarked");
  });

  it("offers a source bridge only when the connection is strong", () => {
    const decision = decideNextAction([signal("topic_interest", { sourceRelevance: 0.9 })], calmEngagement(), { sourceAnchorActive: true });
    expect(decision.action).toBe("bridge_to_text");
    expect(decision.thread?.status).toBe("woven_in");
  });

  it("does not force a source return during spontaneous elaboration", () => {
    const decision = decideNextAction([signal("spontaneous_elaboration", { sourceRelevance: 0.95 })], calmEngagement(), { sourceAnchorActive: true });
    expect(decision.action).toBe("weave_in");
  });

  it("keeps a thread active when the learner continues to show interest", () => {
    const thread: LearningThread = {
      id: "thread-1",
      conversationId: "conversation-a",
      triggerSignalId: "old",
      kind: "construction",
      learnerGoal: "Use a concession",
      targetArabic: "مَعَ أَنَّ",
      relatedCompetencies: ["c-production"],
      relatedPassages: [],
      priority: 0.62,
      status: "woven_in",
      lastLearnerInterestAt: "2026-01-01T00:00:00.000Z",
      successfulUses: 0,
    };
    const continued = continueLearningThread(thread, signal("construction_attempt", { persistence: 0.9 }));
    expect(continued.status).toBe("active");
    expect(continued.priority).toBeGreaterThan(thread.priority);
  });

  it("checks in naturally when affect evidence is ambiguous", () => {
    const decision = decideNextAction([signal("possible_fatigue", { confidence: 0.55 })], calmEngagement());
    expect(decision.action).toBe("confirm_gently");
  });
});

function signal(type: InteractionSignal["type"], overrides: Partial<InteractionSignal> = {}): InteractionSignal {
  return {
    id: `signal-${type}`,
    conversationId: "conversation-a",
    turnId: "turn-test",
    type,
    confidence: 0.78,
    explicitness: 0.55,
    persistence: 0.62,
    sourceRelevance: 0.3,
    detectedAt: "2026-07-14T00:00:00.000Z",
    ...overrides,
  };
}

function calmEngagement(): EngagementState {
  return {
    engagementProbability: 0.62,
    boredomProbability: 0.1,
    overloadProbability: 0.1,
    fatigueProbability: 0.08,
    challengeLevel: 0.5,
    confidence: 0.7,
    supportingSignals: [],
    windowStartTurnId: "turn-test",
    windowEndTurnId: "turn-test",
  };
}
