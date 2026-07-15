import type { GlossToken } from "@/lib/types";

export type DisplayToken = GlossToken & { isEnglishBridge: boolean };

export function alignDisplayTokens(transcript: string, glosses: GlossToken[]): DisplayToken[] {
  const remaining = [...glosses];
  return transcript.split(/\s+/).filter(Boolean).map((token) => {
    const normalized = normalizeToken(token);
    const matchIndex = remaining.findIndex((gloss) => normalizeToken(gloss.arabic) === normalized);
    const matched = matchIndex >= 0 ? remaining.splice(matchIndex, 1)[0] : undefined;
    const isEnglishBridge = /[A-Za-z]/.test(token);
    return {
      arabic: token,
      english: matched?.english || (isEnglishBridge ? "English bridge while reaching for Arabic" : "tap to explore"),
      root: matched?.root,
      isEnglishBridge,
    };
  });
}

function normalizeToken(value: string): string {
  return value
    .replace(/[«»“”'"،؛؟?!.:…]/g, "")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06EDـ]/g, "")
    .toLowerCase();
}
