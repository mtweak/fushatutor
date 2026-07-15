export type ExtractedPdfPage = {
  page: number;
  text: string;
};

export type DetectedSourceSection = {
  label: string;
  sequence: number;
  pageStart: number;
  pageEnd: number;
  pages: ExtractedPdfPage[];
  promptPageCount: number;
};

const sectionHeading = /^(?:(?:الوحدة|الفصل|الباب)\s+[\p{L}\p{M}ـ -]{1,48}|(?:unit|chapter)\s+\d{1,3})$/iu;
const promptLanguage = /(?:أجيبوا|أجب|ناقشوا|ناقش|تناقشوا|تحدّثوا|تحدثوا|اسألوا|ما رأي|هل ترى|الأسئلة|حول الأسئلة)/u;

export function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").trim() || "Imported Arabic text";
}

export function normalizePdfPageText(text: string): string {
  return text
    .replace(/هللا/gu, "الله")
    .replace(/األ/gu, "الأ")
    .replace(/اإل/gu, "الإ")
    .replace(/اآل/gu, "الآ")
    .replace(/^ال يأتون/gu, "لا يأتون")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !/^© Copyright .* Page \d+$/i.test(line) &&
        !/^_{4,}$/u.test(line) &&
        !/^[\p{M}\s]+$/u.test(line),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isDiscussionPromptPage(text: string): boolean {
  return promptLanguage.test(text) || (text.match(/؟/gu)?.length ?? 0) >= 2;
}

export function detectCourseBookSections(pages: ExtractedPdfPage[]): DetectedSourceSection[] {
  const normalizedPages = pages
    .map((page) => ({ ...page, text: normalizePdfPageText(page.text) }))
    .filter((page) => page.text);
  const starts = normalizedPages.flatMap((page) => {
    const label = page.text
      .split(/\n/)
      .map((line) => line.trim())
      .find((line) => sectionHeading.test(line));
    return label ? [{ label, page: page.page }] : [];
  });

  // A single heading is often a mention in a contents page. Split only when
  // the document shows a repeatable course-book structure.
  if (starts.length < 2) return [];

  return starts.map((start, index) => {
    const nextStart = starts[index + 1]?.page;
    const sectionPages = normalizedPages.filter(
      (page) => page.page >= start.page && (!nextStart || page.page < nextStart),
    );
    return {
      label: start.label,
      sequence: index + 1,
      pageStart: start.page,
      pageEnd: sectionPages.at(-1)?.page ?? start.page,
      pages: sectionPages,
      promptPageCount: sectionPages.filter((page) => isDiscussionPromptPage(page.text)).length,
    };
  });
}

export function countPromptPages(pages: ExtractedPdfPage[]): number {
  return pages.filter((page) => isDiscussionPromptPage(page.text)).length;
}
