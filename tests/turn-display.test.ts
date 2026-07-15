import { describe, expect, it } from "vitest";
import { alignDisplayTokens } from "@/lib/turn-display";
import { glossArabic, needsGlossLookup } from "@/lib/arabic";

describe("conversation token alignment", () => {
  it("preserves English bridge words while attaching Arabic contextual glosses", () => {
    const tokens = alignDisplayTokens("كَيْفَ أَقُولُ: although I agree?", [
      { arabic: "كَيْفَ", english: "how" },
      { arabic: "أَقُولُ", english: "I say", root: "ق و ل" },
    ]);
    expect(tokens.map((token) => token.arabic)).toEqual(["كَيْفَ", "أَقُولُ:", "although", "I", "agree?"]);
    expect(tokens[1].english).toBe("I say");
    expect(tokens[2].isEnglishBridge).toBe(true);
  });
});

describe("word gloss lookup", () => {
  it("distinguishes a useful local meaning from a lookup placeholder", () => {
    expect(needsGlossLookup(glossArabic("كَيْفَ")[0])).toBe(false);
    expect(needsGlossLookup(glossArabic("وَعَلَيْكُمُ")[0])).toBe(true);
  });
});
