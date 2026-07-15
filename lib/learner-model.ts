import type { AdaptiveFocus, EngagementState, LearnerState, VocabularyItem, VocabularyStatus } from "@/lib/types";
import { TUTOR_POLICY } from "@/lib/tutor-policy";

export const EVIDENCE_WEIGHTS = {
  spontaneous: 1,
  visual: 0.75,
  english: 0.55,
  arabicStem: 0.35,
  imitation: 0.2,
} as const;

export function updateMastery(
  state: LearnerState,
  evidence: { success: boolean; weight: number; confidence: number; retrievalLatencyMs?: number },
): LearnerState {
  const confidence = clamp(evidence.confidence, 0, 1);
  const weight = clamp(evidence.weight, 0, 1) * confidence;

  if ((!evidence.success && confidence < 0.85) || (evidence.success && confidence < 0.65)) {
    return state;
  }

  const priorStrength = Math.max(2, (1 - state.uncertainty) * 12);
  const alpha = state.masteryProbability * priorStrength + (evidence.success ? weight * 2.2 : 0);
  const beta = (1 - state.masteryProbability) * priorStrength + (evidence.success ? 0 : weight * 2.4);
  const masteryProbability = clamp(alpha / (alpha + beta), 0.02, 0.98);
  const uncertainty = clamp(state.uncertainty * (1 - weight * 0.16), 0.04, 0.5);
  const latencyScore = evidence.retrievalLatencyMs
    ? clamp(1 - (evidence.retrievalLatencyMs - 700) / 5_300, 0, 1)
    : state.automaticity;
  const automaticity = clamp(
    state.automaticity * (1 - weight * 0.18) + latencyScore * weight * 0.18,
    0.02,
    0.98,
  );

  return {
    ...state,
    masteryProbability,
    uncertainty,
    automaticity,
    medianRetrievalLatencyMs: evidence.retrievalLatencyMs ?? state.medianRetrievalLatencyMs,
    retentionHalfLifeDays: evidence.success
      ? state.retentionHalfLifeDays * (1 + weight * (state.mode === "spontaneous_production" ? 0.7 : 0.28))
      : Math.max(0.75, state.retentionHalfLifeDays * 0.82),
  };
}

export function classifyVocabularyStatus(item: VocabularyItem): VocabularyStatus {
  const mastery = TUTOR_POLICY.mastery;
  const activelyMastered =
    item.production >= mastery.spontaneousProduction &&
    item.comprehension >= mastery.listeningComprehension &&
    item.uncertainty <= mastery.maximumUncertainty &&
    item.contextCount >= mastery.minimumContexts &&
    item.successfulDelayedUse;

  if (activelyMastered) return "mastered";
  if (item.production < 0.35 && item.comprehension < 0.7) return "to_acquire";
  return "learning";
}

export function predictedRetrievability(halfLifeDays: number, elapsedDays: number): number {
  if (halfLifeDays <= 0) return 0;
  return Math.pow(2, -Math.max(0, elapsedDays) / halfLifeDays);
}

export function acquisitionPriority(item: VocabularyItem, learnerInterest = 0): number {
  const graphCentrality = Math.min(1, (item.collocations.length + item.examples.length) / 5);
  const passiveAvoidance = clamp(item.comprehension - item.production, 0, 1);
  return clamp(
    item.sourceRelevance * 0.35 +
      item.discussionUtility * 0.25 +
      graphCentrality * 0.2 +
      passiveAvoidance * 0.1 +
      learnerInterest * 0.1,
    0,
    1,
  );
}

export function recommendAdaptiveFocus(
  states: LearnerState[],
  engagement?: EngagementState,
): AdaptiveFocus {
  const focus = [...states].sort((a, b) => focusNeed(b) - focusNeed(a))[0] ?? {
    competencyId: "c-vocab",
    domain: "vocabulary" as const,
    label: "Activating vocabulary",
    arabicLabel: "اِسْتِحْضَارُ الْمُفْرَدَاتِ",
    mode: "spontaneous_production" as const,
    masteryProbability: 0.3,
    uncertainty: 0.3,
    automaticity: 0.25,
    retentionHalfLifeDays: 1,
    contextCount: 0,
  };
  const adjustment = engagement?.overloadProbability && engagement.overloadProbability >= TUTOR_POLICY.engagement.overloadActionThreshold
    ? "downshift"
    : engagement?.boredomProbability && engagement.boredomProbability >= TUTOR_POLICY.engagement.boredomActionThreshold
      ? "upshift"
      : "hold";
  return {
    competencyId: focus.competencyId,
    domain: focus.domain,
    label: focus.label,
    arabicLabel: focus.arabicLabel,
    adjustment,
    difficultyAxis: axisForDomain(focus.domain),
    rationale: focusRationale(focus, adjustment),
    masteryProbability: focus.masteryProbability,
    targetSuccessBand: [...TUTOR_POLICY.flow.successBand],
  };
}

function focusNeed(state: LearnerState): number {
  const productionGap = 1 - state.masteryProbability;
  const automaticityGap = 1 - state.automaticity;
  const uncertainty = state.uncertainty;
  const productionMultiplier = ["spontaneous_production", "cued_production", "listening_comprehension"].includes(state.mode) ? 1.12 : 0.88;
  return (productionGap * 0.48 + automaticityGap * 0.3 + uncertainty * 0.22) * productionMultiplier;
}

function axisForDomain(domain: LearnerState["domain"]): AdaptiveFocus["difficultyAxis"] {
  if (domain === "listening") return "audio_length";
  if (domain === "vocabulary" || domain === "idiom_pragmatics") return "lexical_rarity";
  if (domain === "grammar") return "syntax";
  if (domain === "summarization") return "audio_length";
  if (domain === "pronunciation") return "speech_speed";
  return "abstraction";
}

function focusRationale(state: LearnerState, adjustment: AdaptiveFocus["adjustment"]): string {
  const support = adjustment === "downshift"
    ? "The next turn will shorten the task and restore one support."
    : adjustment === "upshift"
      ? "The next turn will add one fresh challenge while preserving the topic."
      : "The next turn will keep the same challenge and reduce help only after independent success.";
  return `${state.label} has the strongest combination of retrieval gap, uncertainty, and low automaticity. ${support}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
