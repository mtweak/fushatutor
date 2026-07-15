import type {
  EngagementState,
  InteractionSignal,
  InteractionSignalType,
  LearningThread,
  OrchestrationDecision,
  TurnAnalysis,
  TurnMetrics,
  VocabularyItem,
} from "@/lib/types";
import { TUTOR_POLICY } from "@/lib/tutor-policy";

const arabicWordCount = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;
const id = (prefix: string) => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;

export function detectSignals(input: {
  conversationId: string;
  turnId: string;
  transcript: string;
  metrics?: TurnMetrics;
  recentLearnerTurns?: string[];
  sourceTerms?: string[];
}): InteractionSignal[] {
  const transcript = input.transcript.trim();
  const normalized = transcript.replace(/[؟?!.،]/g, " ");
  const metrics = input.metrics ?? {};
  const now = new Date().toISOString();
  const signals: InteractionSignal[] = [];
  const add = (
    type: InteractionSignalType,
    confidence: number,
    overrides: Partial<InteractionSignal> = {},
  ) => {
    signals.push({
      id: id("signal"),
      conversationId: input.conversationId,
      turnId: input.turnId,
      type,
      confidence,
      explicitness: overrides.explicitness ?? 0.2,
      persistence: overrides.persistence ?? 0.2,
      sourceRelevance: overrides.sourceRelevance ?? sourceRelevance(transcript, input.sourceTerms ?? []),
      detectedAt: now,
      targetText: overrides.targetText,
      intendedMeaning: overrides.intendedMeaning,
    });
  };

  if (/كَيْفَ\s+(أَقُولُ|نَقُولُ)|مَا\s+(مَعْنَى|مَعْنَاهُ)|أُرِيدُ\s+أَنْ\s+أَقُولَ|how (do|can) i say/i.test(transcript)) {
    add("explicit_learning_request", 0.96, { explicitness: 1, persistence: 0.65, targetText: transcript });
  }
  if (/[A-Za-z]{2,}/.test(transcript)) {
    const english = transcript.match(/[A-Za-z][A-Za-z\s'-]*/)?.[0]?.trim();
    add("lexical_gap", 0.9, { explicitness: 0.65, targetText: english, intendedMeaning: english });
  }
  if (/يَعْنِي|أَقْصِدُ|أَعْنِي|لَا أَعْرِفُ الْكَلِمَةَ|مَا اسْمُ/.test(normalized)) {
    add("meaning_uncertainty", 0.82, { explicitness: 0.72, targetText: transcript });
  }
  if (/أُرِيدُ أَنْ|لَوْ أَنَّ|مَعَ أَنَّ|يَبْدُو لِي|وَلٰكِنْ/.test(normalized) && metrics.repairCount && metrics.repairCount > 0) {
    add("construction_attempt", 0.8, { persistence: 0.68, targetText: transcript });
  }
  if (/السَّلَام|أَهْلًا|مَرْحَبًا/.test(normalized) && arabicWordCount(transcript) <= 3 && (metrics.repairCount ?? 0) > 0) {
    add("failed_communicative_attempt", 0.88, { explicitness: 0.72, persistence: 0.7, targetText: transcript });
  }
  if ((metrics.repairCount ?? 0) >= 2) {
    add("self_repair_cluster", 0.84, { persistence: 0.82, targetText: transcript });
  }
  if (/لِمَاذَا|كَيْفَ|هَلْ يُمْكِنُ|مَا الْفَرْقُ|أَعْطِنِي مِثَالًا/.test(normalized)) {
    add("topic_interest", 0.78, { explicitness: 0.55, persistence: 0.62, targetText: transcript });
  }
  if (arabicWordCount(transcript) >= 22) {
    add("spontaneous_elaboration", 0.76, { persistence: 0.68, targetText: transcript });
  }
  if (metrics.interruptedTutor) {
    add("desire_to_interrupt", 0.68, { explicitness: 0.5, targetText: transcript });
  }

  const recent = input.recentLearnerTurns ?? [];
  const shortRun = recent.slice(-2).every((turn) => arabicWordCount(turn) <= 4);
  if (shortRun && recent.length >= 2 && arabicWordCount(transcript) <= 4 && (metrics.responseOnsetMs ?? 5_000) < 1_400) {
    add("possible_boredom", 0.62, { persistence: 0.56 });
  }
  if (
    (metrics.responseOnsetMs ?? 0) > 5_000 ||
    (metrics.midClausePauses ?? 0) >= 3 ||
    ((metrics.repairCount ?? 0) >= 2 && /[A-Za-z]/.test(transcript))
  ) {
    add("possible_overload", 0.77, { persistence: 0.7 });
  }
  if ((metrics.responseOnsetMs ?? 0) > 6_500 && (metrics.repairCount ?? 0) === 0 && arabicWordCount(transcript) <= 5) {
    add("possible_fatigue", 0.55, { persistence: 0.45 });
  }

  return signals;
}

export function estimateEngagement(
  turnId: string,
  signals: InteractionSignal[],
  metrics: TurnMetrics = {},
): EngagementState {
  const has = (type: InteractionSignalType) => signals.find((signal) => signal.type === type);
  const engagementEvidence = [has("topic_interest"), has("spontaneous_elaboration"), has("desire_to_interrupt")].filter(Boolean);
  const boredom = has("possible_boredom")?.confidence ?? 0.12;
  const overload = Math.max(
    has("possible_overload")?.confidence ?? 0.1,
    has("self_repair_cluster") ? 0.58 : 0,
  );
  const fatigue = has("possible_fatigue")?.confidence ?? 0.08;
  const engagement = Math.max(0.36, ...engagementEvidence.map((signal) => signal?.confidence ?? 0));
  const support = signals.map((signal) => signal.type);

  return {
    engagementProbability: round(engagement),
    boredomProbability: round(boredom),
    overloadProbability: round(overload),
    fatigueProbability: round(fatigue),
    challengeLevel: round(Math.max(0.25, Math.min(0.9, 0.48 + overload * 0.35 - boredom * 0.18))),
    confidence: round(Math.min(0.92, 0.34 + signals.length * 0.12 + ((metrics.asrConfidence ?? 0.7) - 0.5) * 0.2)),
    supportingSignals: support,
    windowStartTurnId: turnId,
    windowEndTurnId: turnId,
  };
}

export function createLearningThread(signal: InteractionSignal): LearningThread {
  const kind = threadKind(signal.type);
  const weights = TUTOR_POLICY.threadPriority;
  const priority = round(
    signal.explicitness * weights.explicitRequest +
      signal.persistence * weights.persistence +
      communicativeUsefulness(signal.type) * weights.communicativeUsefulness +
      observedInterest(signal.type) * weights.observedInterest +
      signal.sourceRelevance * weights.sourceRelevance,
  );
  return {
    id: id("thread"),
    conversationId: signal.conversationId,
    triggerSignalId: signal.id,
    kind,
    learnerGoal: learnerGoal(signal),
    targetArabic: signal.targetText,
    relatedCompetencies: relatedCompetencies(signal.type),
    relatedPassages: [],
    priority,
    status: priority >= 0.68 ? "active" : "bookmarked",
    lastLearnerInterestAt: signal.detectedAt,
    successfulUses: 0,
  };
}

export function decideNextAction(
  signals: InteractionSignal[],
  engagement: EngagementState,
  context: { preserveCurrentThought?: boolean; sourceAnchorActive?: boolean } = {},
): OrchestrationDecision {
  const strongest = [...signals].sort((a, b) => signalPriority(b) - signalPriority(a))[0];

  if (strongest?.type === "explicit_learning_request") {
    const thread = createLearningThread(strongest);
    return { action: "follow_now", reason: "The learner directly signaled an immediate communicative need.", targetSignalId: strongest.id, thread };
  }
  if (strongest?.type === "failed_communicative_attempt") {
    return {
      action: "continue_flow",
      reason: "The intended social move is understandable; respond naturally and preserve momentum without launching a drill.",
      targetSignalId: strongest.id,
    };
  }
  if (engagement.overloadProbability >= TUTOR_POLICY.engagement.overloadActionThreshold) {
    return { action: "reduce_load", reason: "Several high-confidence struggle cues appeared together.", difficultyAxis: "support" };
  }
  if (engagement.boredomProbability >= TUTOR_POLICY.engagement.boredomActionThreshold) {
    return { action: "raise_novelty", reason: "Responses are fast and consistently brief across several turns.", difficultyAxis: "abstraction" };
  }
  if (strongest?.type === "topic_interest" && context.preserveCurrentThought && strongest.explicitness < 0.8) {
    const thread = createLearningThread(strongest);
    thread.status = "bookmarked";
    return { action: "bookmark", reason: "The interest is valuable, but the learner is still completing a productive thought.", targetSignalId: strongest.id, thread };
  }
  if (strongest && ["lexical_gap", "construction_attempt", "meaning_uncertainty"].includes(strongest.type)) {
    const thread = createLearningThread(strongest);
    return {
      action: thread.priority >= 0.68 ? "follow_now" : "weave_in",
      reason: "A language gap is blocking the learner’s current thought.",
      targetSignalId: strongest.id,
      thread,
    };
  }
  if (strongest?.type === "spontaneous_elaboration") {
    const thread = createLearningThread(strongest);
    return { action: "weave_in", reason: "The learner is voluntarily extending this topic.", targetSignalId: strongest.id, thread };
  }
  if (strongest?.type === "topic_interest") {
    const thread = createLearningThread(strongest);
    if (context.sourceAnchorActive && strongest.sourceRelevance >= 0.65) {
      thread.status = "woven_in";
      thread.sourceBridge = "Offer the related source passage as a continuation, not a forced return.";
      return { action: "bridge_to_text", reason: "The learner's question has a strong, natural connection to the active passage.", targetSignalId: strongest.id, thread };
    }
    return { action: "weave_in", reason: "The learner is voluntarily extending this topic.", targetSignalId: strongest.id, thread };
  }
  if (strongest && strongest.confidence < TUTOR_POLICY.engagement.ambiguousCueThreshold) {
    return { action: "confirm_gently", reason: "The cue is useful but too uncertain to act on silently." };
  }
  return { action: "continue_flow", reason: "No strong cue should interrupt the current conversational arc." };
}

export function analyzeTurn(input: {
  conversationId: string;
  turnId: string;
  transcript: string;
  metrics?: TurnMetrics;
  recentLearnerTurns?: string[];
  vocabulary?: VocabularyItem[];
  sourceTerms?: string[];
  preserveCurrentThought?: boolean;
}): TurnAnalysis {
  const signals = detectSignals(input);
  const engagement = estimateEngagement(input.turnId, signals, input.metrics);
  const decision = decideNextAction(signals, engagement, {
    preserveCurrentThought: input.preserveCurrentThought,
    sourceAnchorActive: Boolean(input.sourceTerms?.length),
  });
  const vocabularyEvidence = (input.vocabulary ?? [])
    .filter((item) => input.transcript.includes(item.lemma) || input.transcript.includes(item.vocalized))
    .map((item) => ({
      vocabularyId: item.id,
      mode: "spontaneous_production" as const,
      success: true,
      independenceWeight: 1,
      confidence: input.metrics?.asrConfidence ?? 0.78,
      retrievalLatencyMs: input.metrics?.responseOnsetMs,
    }));
  return {
    signals,
    engagement,
    decision,
    suggestedReply: suggestedReply(decision, input.transcript),
    vocabularyEvidence,
  };
}

function suggestedReply(decision: OrchestrationDecision, transcript: string): string {
  if (/السَّلَام|أَهْلًا|مَرْحَبًا/.test(transcript)) {
    return "وَعَلَيْكُمُ السَّلَامُ وَرَحْمَةُ اللهِ. كَيْفَ حَالُكَ الْيَوْمَ؟";
  }
  switch (decision.action) {
    case "follow_now":
      return "فَهِمْتُ مَا تُرِيدُهُ. يُمْكِنُكَ أَنْ تَقُولَ: «يَبْدُو لِي أَنَّ…». فَاسْتَعْمِلْهَا الْآنَ فِي فِكْرَتِكَ نَفْسِهَا.";
    case "weave_in":
      return "فَهِمْتُ مَقْصِدَكَ، وَهٰذَا مَعْنًى مُهِمٌّ. مَا الَّذِي جَعَلَكَ تَنْظُرُ إِلَيْهِ هٰكَذَا؟";
    case "bookmark":
      return "هٰذِهِ فِكْرَةٌ تَسْتَحِقُّ أَنْ نَعُودَ إِلَيْهَا. أَكْمِلْ فِكْرَتَكَ أَوَّلًا، وَسَأَحْفَظُهَا لَنَا.";
    case "bridge_to_text":
      return "يَتَّصِلُ سُؤَالُكَ بِالْمَقْطَعِ اتِّصَالًا جَمِيلًا. أَتُحِبُّ أَنْ نَنْظُرَ فِي عِبَارَتِهِ، ثُمَّ تُعَبِّرَ عَنْهَا بِكَلِمَاتِكَ؟";
    case "raise_novelty":
      return "لِنُغَيِّرِ الْمَشْهَدَ: تَخَيَّلْ أَنَّكَ فِي مَجْلِسٍ وَخَالَفَكَ أَحَدُهُمْ. كَيْفَ تُبَيِّنُ رَأْيَكَ بِلُطْفٍ؟";
    case "reduce_load":
      return "فَهِمْتُ الْفِكْرَةَ الْعَامَّةَ. أَتَقْصِدُ أَنَّ هٰذَا الْأَمْرَ ثَابِتٌ، أَمْ أَنَّهُ يَتَغَيَّرُ؟";
    case "confirm_gently":
      return "أَتُحِبُّ أَنْ نَتَوَقَّفَ عِنْدَ هٰذِهِ الْعِبَارَةِ، أَمْ نَمْضِيَ فِي الْحَدِيثِ؟";
    default:
      return "فَهِمْتُ مَقْصِدَكَ. مَا الَّذِي حَدَثَ بَعْدَ ذٰلِكَ؟";
  }
}

export function continueLearningThread(thread: LearningThread, signal: InteractionSignal): LearningThread {
  return {
    ...thread,
    triggerSignalId: signal.id,
    priority: round(Math.max(thread.priority, Math.min(1, thread.priority + signal.persistence * 0.12))),
    status: "active",
    lastLearnerInterestAt: signal.detectedAt,
  };
}

function threadKind(type: InteractionSignalType): LearningThread["kind"] {
  if (type === "construction_attempt") return "construction";
  if (type === "lexical_gap" || type === "meaning_uncertainty") return "word";
  if (type === "topic_interest" || type === "spontaneous_elaboration") return "concept";
  if (type === "failed_communicative_attempt") return "discussion_move";
  return "phrase";
}

function learnerGoal(signal: InteractionSignal): string {
  const target = signal.targetText ? `: ${signal.targetText}` : "";
  const goals: Partial<Record<InteractionSignalType, string>> = {
    explicit_learning_request: `Express the intended idea naturally${target}`,
    failed_communicative_attempt: `Complete the social move confidently${target}`,
    lexical_gap: `Retrieve the missing word without switching languages${target}`,
    construction_attempt: `Use the attempted construction in live speech${target}`,
    meaning_uncertainty: `Distinguish the contextual meaning${target}`,
    topic_interest: `Explore the concept through conversation${target}`,
  };
  return goals[signal.type] ?? `Follow the learner’s communicative interest${target}`;
}

function relatedCompetencies(type: InteractionSignalType): string[] {
  if (type === "lexical_gap" || type === "meaning_uncertainty") return ["c-vocab", "c-listen"];
  if (type === "construction_attempt") return ["c-production", "c-discourse"];
  if (type === "failed_communicative_attempt") return ["c-discourse", "c-vocab"];
  return ["c-discourse"];
}

function signalPriority(signal: InteractionSignal): number {
  return signal.confidence * 0.35 + signal.explicitness * 0.3 + signal.persistence * 0.25 + signal.sourceRelevance * 0.1;
}

function sourceRelevance(transcript: string, sourceTerms: string[]): number {
  if (!sourceTerms.length) return 0.3;
  const matches = sourceTerms.filter((term) => transcript.includes(term)).length;
  return Math.min(1, 0.2 + matches * 0.35);
}

function communicativeUsefulness(type: InteractionSignalType): number {
  return ["explicit_learning_request", "failed_communicative_attempt", "lexical_gap", "construction_attempt"].includes(type)
    ? 0.95
    : 0.62;
}

function observedInterest(type: InteractionSignalType): number {
  return ["topic_interest", "spontaneous_elaboration", "desire_to_interrupt"].includes(type) ? 0.95 : 0.58;
}

function round(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}
