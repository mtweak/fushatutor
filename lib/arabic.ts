import type { GlossToken } from "@/lib/types";

export const GLOSS_LOOKUP_PLACEHOLDER = "tap to explore";

const GLOSSES: Record<string, { english: string; root?: string }> = {
  "أَهْلًا": { english: "welcome" },
  "بِكَ": { english: "to you" },
  "نَعَمْ": { english: "yes" },
  "لِنَبْدَأْ": { english: "let us begin", root: "ب د أ" },
  "لِنَأْخُذْ": { english: "let us take", root: "أ خ ذ" },
  "فِكْرَةً": { english: "an idea", root: "ف ك ر" },
  "وَاحِدَةً": { english: "one" },
  "فَقَطْ": { english: "only" },
  "مَا": { english: "what" },
  "الْفَرْقُ": { english: "the difference", root: "ف ر ق" },
  "بَيْنَ": { english: "between" },
  "الْمَقَامِ": { english: "the station", root: "ق و م" },
  "الْمَقَامَ": { english: "the station", root: "ق و م" },
  "وَالْحَالِ": { english: "and the state", root: "ح و ل" },
  "الْحَالُ": { english: "the state", root: "ح و ل" },
  "يَبْدُو": { english: "it appears", root: "ب د و" },
  "لِي": { english: "to me" },
  "أَنَّ": { english: "that" },
  "مَعَ": { english: "although / with" },
  "فَإِنَّ": { english: "then indeed" },
  "أَكْمِلْ": { english: "complete", root: "ك م ل" },
  "هٰذَا": { english: "this" },
  "سُؤَالٌ": { english: "a question", root: "س أ ل" },
  "مُهِمٌّ": { english: "important", root: "ه م م" },
  "كَيْفَ": { english: "how" },
  "تُعَبِّرُ": { english: "you express", root: "ع ب ر" },
  "عَنْ": { english: "about" },
  "الْمَعْنَى": { english: "the meaning", root: "ع ن ي" },
  "بِكَلِمَاتِكَ": { english: "in your words", root: "ك ل م" },
  "أَحْسَنْتَ": { english: "you did well", root: "ح س ن" },
  "مِثَالٌ": { english: "an example", root: "م ث ل" },
  "مِنْ": { english: "from" },
  "تَجْرِبَتِكَ": { english: "your experience", root: "ج ر ب" },
};

export function glossArabic(arabic: string): GlossToken[] {
  return arabic
    .replace(/[«»“”]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const clean = token.replace(/[،؛؟.!:]/g, "");
      return { arabic: token, ...(GLOSSES[clean] ?? { english: GLOSS_LOOKUP_PLACEHOLDER }) };
    });
}

export function needsGlossLookup(gloss: Pick<GlossToken, "english">): boolean {
  return !gloss.english.trim() || gloss.english.trim().toLowerCase() === GLOSS_LOOKUP_PLACEHOLDER;
}

export function stripTashkeel(value: string): string {
  return value.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06EDـ]/g, "");
}
