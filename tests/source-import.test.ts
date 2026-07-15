import { describe, expect, it } from "vitest";
import {
  detectCourseBookSections,
  isDiscussionPromptPage,
  normalizePdfPageText,
  titleFromFileName,
} from "@/lib/source-import";

describe("source import", () => {
  it("uses the filename as a non-blocking default title", () => {
    expect(titleFromFileName("كلاسيكي خامس.pdf")).toBe("كلاسيكي خامس");
  });

  it("detects real unit heading pages and ignores numbered contents entries", () => {
    const sections = detectCourseBookSections([
      { page: 2, text: "الفهرس\nالوحدة الأولى 6\nالوحدة الثانية 25" },
      { page: 7, text: "© Copyright 2015 Qasid, Inc. .www.qasid.com  .  Classical Arabic  .  Level 5.     Page 6\nالوحدة الأولى" },
      { page: 8, text: "المفردات\nتمهيد طويل للنص الأول" },
      { page: 20, text: "بعد قراءتكم النص ناقشوا هذه الأسئلة.\nما أوجه الإعجاز؟" },
      { page: 26, text: "الوحدة الثانية" },
      { page: 27, text: "فيه هدى\nتمهيد طويل للنص الثاني" },
    ]);

    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({ label: "الوحدة الأولى", pageStart: 7, pageEnd: 20, promptPageCount: 1 });
    expect(sections[1]).toMatchObject({ label: "الوحدة الثانية", pageStart: 26, pageEnd: 27 });
  });

  it("recognizes pages designed to lead a conversation", () => {
    expect(isDiscussionPromptPage("تناقشوا مع زملائكم في المعنى الآتي")).toBe(true);
    expect(isDiscussionPromptPage("ما معنى العبارة؟ وهل توافق الكاتب؟")).toBe(true);
    expect(isDiscussionPromptPage("نص سردي بلا سؤال")).toBe(false);
  });

  it("removes repeated Qasid footers without changing the source body", () => {
    expect(
      normalizePdfPageText("© Copyright 2015 Qasid, Inc. .www.qasid.com  .  Classical Arabic  .  Level 5.     Page 6\nالوحدة الأولى"),
    ).toBe("الوحدة الأولى");
  });
});

