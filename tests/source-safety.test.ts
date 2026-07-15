import { describe, expect, it } from "vitest";
import { validateQuranQuote } from "@/lib/source-safety";

const corpus = {
  "1:1": "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
  "1:2": "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ",
};

describe("Qurʾānic quote safety", () => {
  it("returns canonical text only for an exact normalized match", () => {
    const result = validateQuranQuote("  بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ  ", corpus);
    expect(result).toEqual({ verified: true, reference: "1:1", canonicalText: corpus["1:1"] });
  });

  it("does not silently repair an inexact quotation", () => {
    expect(validateQuranQuote("بِسْمِ اللهِ الرَّحْمَنِ الرَّحِيمِ", corpus)).toEqual({ verified: false, reason: "not_exact" });
  });

  it("refuses verification when the corpus is unavailable", () => {
    expect(validateQuranQuote(corpus["1:1"], undefined)).toEqual({ verified: false, reason: "corpus_unavailable" });
  });
});
