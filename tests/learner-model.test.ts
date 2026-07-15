import { describe, expect, it } from "vitest";
import { classifyVocabularyStatus, predictedRetrievability, recommendAdaptiveFocus, updateMastery } from "@/lib/learner-model";
import type { LearnerState, VocabularyItem } from "@/lib/types";

const state: LearnerState = {
  competencyId: "c-test",
  domain: "vocabulary",
  label: "Test",
  arabicLabel: "اِخْتِبَارٌ",
  mode: "spontaneous_production",
  masteryProbability: 0.5,
  uncertainty: 0.25,
  automaticity: 0.3,
  retentionHalfLifeDays: 3,
  contextCount: 1,
};

describe("learner model", () => {
  it("ignores low-confidence negative evidence", () => {
    expect(updateMastery(state, { success: false, weight: 1, confidence: 0.7 })).toEqual(state);
  });

  it("gives independent success a positive but bounded update", () => {
    const updated = updateMastery(state, { success: true, weight: 1, confidence: 0.95, retrievalLatencyMs: 1_300 });
    expect(updated.masteryProbability).toBeGreaterThan(state.masteryProbability);
    expect(updated.uncertainty).toBeLessThan(state.uncertainty);
    expect(updated.automaticity).toBeGreaterThan(state.automaticity);
    expect(updated.retentionHalfLifeDays).toBeGreaterThan(state.retentionHalfLifeDays);
  });

  it("requires comprehension, production, uncertainty, contexts, and delay for mastery", () => {
    const item = vocabulary({ production: 0.9, comprehension: 0.94, uncertainty: 0.09, contextCount: 3, successfulDelayedUse: false });
    expect(classifyVocabularyStatus(item)).toBe("learning");
    expect(classifyVocabularyStatus({ ...item, successfulDelayedUse: true })).toBe("mastered");
  });

  it("predicts one half of memory after one half-life", () => {
    expect(predictedRetrievability(4, 4)).toBeCloseTo(0.5);
  });

  it("selects a weak automatic production area without collapsing it into grammar recognition", () => {
    const strongGrammar = { ...state, competencyId: "c-grammar", domain: "grammar" as const, mode: "reading_recognition" as const, masteryProbability: 0.9, automaticity: 0.7 };
    const weakVocabulary = { ...state, competencyId: "c-vocab", domain: "vocabulary" as const, label: "Activating vocabulary", masteryProbability: 0.32, automaticity: 0.22 };
    const focus = recommendAdaptiveFocus([strongGrammar, weakVocabulary]);
    expect(focus.competencyId).toBe("c-vocab");
    expect(focus.difficultyAxis).toBe("lexical_rarity");
  });

  it("downshifts exactly one difficulty axis when overload is likely", () => {
    const focus = recommendAdaptiveFocus([state], {
      engagementProbability: 0.3,
      boredomProbability: 0.08,
      overloadProbability: 0.76,
      fatigueProbability: 0.1,
      challengeLevel: 0.8,
      confidence: 0.8,
      supportingSignals: ["possible_overload"],
      windowStartTurnId: "turn-1",
      windowEndTurnId: "turn-3",
    });
    expect(focus.adjustment).toBe("downshift");
    expect(focus.targetSuccessBand).toEqual([0.7, 0.85]);
  });
});

function vocabulary(overrides: Partial<VocabularyItem>): VocabularyItem {
  return {
    id: "v-test",
    lemma: "مقام",
    vocalized: "مَقَامٌ",
    root: "ق و م",
    sense: "station",
    englishGloss: "station",
    register: "classical",
    status: "learning",
    comprehension: 0.8,
    production: 0.5,
    automaticity: 0.4,
    uncertainty: 0.2,
    retentionHalfLifeDays: 3,
    contextCount: 1,
    successfulDelayedUse: false,
    sourceRelevance: 1,
    discussionUtility: 1,
    collocations: [],
    examples: [],
    ...overrides,
  };
}
