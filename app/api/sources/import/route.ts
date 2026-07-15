import { createHash } from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { addSource, attachSourceToConversation, getSourcesByFileHash } from "@/lib/db";
import {
  countPromptPages,
  detectCourseBookSections,
  normalizePdfPageText,
  titleFromFileName,
  type ExtractedPdfPage,
} from "@/lib/source-import";
import type { SourceDocument } from "@/lib/types";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let title = "";
    let author: string | undefined;
    let genre = "study text";
    let edition: string | undefined;
    let conversationId: string | undefined;
    let text = "";
    let uploadedFile: File | undefined;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      title = String(form.get("title") || "").trim();
      author = valueOrUndefined(form.get("author"));
      genre = String(form.get("genre") || genre);
      edition = valueOrUndefined(form.get("edition"));
      conversationId = valueOrUndefined(form.get("conversationId"));
      text = String(form.get("text") || "").trim();
      const file = form.get("file");
      if (file instanceof File && file.size > 0) uploadedFile = file;
    } else {
      const body = (await request.json()) as {
        title?: string;
        author?: string;
        genre?: string;
        edition?: string;
        text?: string;
        conversationId?: string;
      };
      title = body.title?.trim() || "";
      author = body.author;
      genre = body.genre || genre;
      edition = body.edition;
      conversationId = body.conversationId;
      text = body.text?.trim() || "";
    }

    if (uploadedFile) {
      if (uploadedFile.size > MAX_FILE_BYTES) throw new Error("Choose a file smaller than 25 MB.");
      title ||= titleFromFileName(uploadedFile.name);
      const bytes = Buffer.from(await uploadedFile.arrayBuffer());
      const fileHash = createHash("sha256").update(bytes).digest("hex");
      const existing = getSourcesByFileHash(fileHash);
      if (existing.length) {
        if (conversationId) attachSourceToConversation(existing[0].id, conversationId);
        return NextResponse.json(importSummary(existing, existing.reduce((maximum, source) => Math.max(maximum, source.pageEnd || 0), 0), true));
      }

      if (uploadedFile.type === "application/pdf" || uploadedFile.name.toLowerCase().endsWith(".pdf")) {
        const parsed = await extractPdfPages(bytes);
        if (!parsed.pages.length || parsed.pages.every((page) => page.text.length < 20)) {
          throw new Error("This PDF does not contain readable text. Upload chapter page images for OCR, or use a text-searchable PDF.");
        }
        const sections = detectCourseBookSections(parsed.pages);
        const collectionId = `collection-${fileHash.slice(0, 20)}`;
        const sources = sections.length
          ? sections.map((section, index) =>
              addSource(
                {
                  title: section.label,
                  author,
                  genre,
                  edition,
                  pages: section.pages,
                  sourceType: "course_book_unit",
                  collectionId,
                  collectionTitle: title,
                  sectionLabel: section.label,
                  pageStart: section.pageStart,
                  pageEnd: section.pageEnd,
                  fileName: uploadedFile.name,
                  fileHash,
                  promptPageCount: section.promptPageCount,
                },
                index === 0 ? conversationId : undefined,
              ),
            )
          : [
              addSource(
                {
                  title,
                  author,
                  genre,
                  edition,
                  pages: parsed.pages,
                  sourceType: "text",
                  pageStart: parsed.pages[0]?.page,
                  pageEnd: parsed.pages.at(-1)?.page,
                  fileName: uploadedFile.name,
                  fileHash,
                  promptPageCount: countPromptPages(parsed.pages),
                },
                conversationId,
              ),
            ];
        return NextResponse.json(importSummary(sources, parsed.totalPages, false), { status: 201 });
      }

      if (uploadedFile.type.startsWith("image/")) text = await extractArabicFromImage(uploadedFile);
      else text = bytes.toString("utf8").trim();

      const source = addSource(
        { title, author, genre, edition, text, fileName: uploadedFile.name, fileHash },
        conversationId,
      );
      return NextResponse.json(importSummary([source], 1, false), { status: 201 });
    }

    title ||= "Imported Arabic text";
    if (!text) return NextResponse.json({ error: "Paste Arabic text or choose a file to continue." }, { status: 400 });
    const source = addSource({ title, author, genre, edition, text }, conversationId);
    return NextResponse.json(importSummary([source], 1, false), { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The source could not be imported.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function valueOrUndefined(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

async function extractPdfPages(bytes: Buffer): Promise<{ pages: ExtractedPdfPage[]; totalPages: number }> {
  const pages: ExtractedPdfPage[] = [];
  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts/"),
  });
  const document = await loadingTask.promise;
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items.filter((item): item is Extract<typeof item, { str: string }> => "str" in item);
      const pageText = renderTextItems(items);
      pages.push({ page: pageNumber, text: normalizePdfPageText(pageText) });
      page.cleanup();
    }
    return { pages: pages.filter((page) => page.text), totalPages: document.numPages };
  } finally {
    await document.cleanup();
    await loadingTask.destroy();
  }
}

type PdfTextItem = {
  str: string;
  dir: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL: boolean;
};

function renderTextItems(items: PdfTextItem[]): string {
  const lines: PdfTextItem[][] = [];
  let current: PdfTextItem[] = [];
  let lastY: number | undefined;
  const flush = () => {
    if (current.some((item) => item.str)) lines.push(current);
    current = [];
    lastY = undefined;
  };

  for (const item of items) {
    const y = item.transform[5];
    if (lastY !== undefined && Math.abs(lastY - y) > 0.75) flush();
    if (item.str) current.push(item);
    lastY = y;
    if (item.hasEOL) flush();
  }
  flush();

  return lines.map(joinTextLine).join("\n");
}

function joinTextLine(line: PdfTextItem[]): string {
  const rtl = line.some((item) => item.dir === "rtl" || /[\u0600-\u06ff]/u.test(item.str));
  return line.reduce((text, item, index) => {
    if (!index) return item.str;
    const previous = line[index - 1];
    const gap = rtl
      ? previous.transform[4] - (item.transform[4] + item.width)
      : item.transform[4] - (previous.transform[4] + previous.width);
    const threshold = Math.max(2.2, Math.min(previous.height || item.height || 12, 18) * 0.18);
    const needsSpace = gap > threshold && !/\s$/u.test(text) && !/^\s/u.test(item.str);
    return `${text}${needsSpace ? " " : ""}${item.str}`;
  }, "");
}

function importSummary(sources: SourceDocument[], totalPages: number, duplicate: boolean) {
  return {
    source: sources[0],
    sources,
    importedSections: sources.length,
    totalPages,
    promptPageCount: sources.reduce((sum, source) => sum + (source.promptPageCount || 0), 0),
    duplicate,
  };
}

async function extractArabicFromImage(file: File): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Image OCR requires OPENAI_API_KEY. Paste the Arabic text or upload a text/PDF file instead.");
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_REFLECTIVE_MODEL || "gpt-5.6-terra",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "Extract the Arabic text exactly. Preserve paragraph breaks. Return only the transcription." },
            { type: "input_image", image_url: `data:${file.type};base64,${base64}` },
          ],
        },
      ],
    }),
  });
  const data = (await response.json()) as { output_text?: string; error?: { message?: string } };
  if (!response.ok || !data.output_text) throw new Error(data.error?.message || "Arabic OCR failed.");
  return data.output_text.trim();
}
