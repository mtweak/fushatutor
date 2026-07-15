import { stripTashkeel } from "@/lib/arabic";

export type QuoteValidation =
  | { verified: true; reference: string; canonicalText: string }
  | { verified: false; reason: "corpus_unavailable" | "not_exact" | "empty" };

/**
 * Qurʾānic text is never repaired or approximated. The caller must supply a
 * verified corpus keyed by sūrah:āyah and display canonicalText verbatim.
 */
export function validateQuranQuote(
  candidate: string,
  corpus: Record<string, string> | undefined,
): QuoteValidation {
  if (!candidate.trim()) return { verified: false, reason: "empty" };
  if (!corpus || Object.keys(corpus).length === 0) return { verified: false, reason: "corpus_unavailable" };
  const exactCandidate = normalizeWhitespace(candidate);
  for (const [reference, canonicalText] of Object.entries(corpus)) {
    if (normalizeWhitespace(canonicalText) === exactCandidate) {
      return { verified: true, reference, canonicalText };
    }
  }
  return { verified: false, reason: "not_exact" };
}

export function similarQuranText(candidate: string, corpus: Record<string, string>): string[] {
  const search = stripTashkeel(candidate).replace(/\s+/g, " ").trim();
  if (search.length < 5) return [];
  return Object.entries(corpus)
    .filter(([, text]) => stripTashkeel(text).includes(search))
    .map(([reference]) => reference)
    .slice(0, 5);
}

function normalizeWhitespace(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}
