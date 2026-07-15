"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { ArrowLeft, BookOpen, Check, FileCheck2, FileImage, FileText, Layers3, Link2, LoaderCircle, Paperclip, Plus, Unlink, UploadCloud } from "lucide-react";
import type { SourceDocument } from "@/lib/types";

export function SourcesView({
  sources,
  activeSourceIds,
  conversationId,
  conversationTitle,
  onImported,
  onBack,
}: {
  sources: SourceDocument[];
  activeSourceIds: string[];
  conversationId: string;
  conversationTitle: string;
  onImported: (conversationId?: string) => Promise<void>;
  onBack: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [messageKind, setMessageKind] = useState<"error" | "success">();
  const [selectedFileName, setSelectedFileName] = useState<string>();
  const [title, setTitle] = useState("");
  const [result, setResult] = useState<{ importedSections: number; totalPages: number; promptPageCount: number; duplicate?: boolean }>();
  const [updatingSourceId, setUpdatingSourceId] = useState<string>();
  const [libraryMessage, setLibraryMessage] = useState<string>();

  const closeDialog = () => {
    if (busy) return;
    setOpen(false);
    setMessage(undefined);
    setMessageKind(undefined);
    setSelectedFileName(undefined);
    setTitle("");
    setResult(undefined);
  };

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    setSelectedFileName(file?.name);
    setMessage(undefined);
    setMessageKind(undefined);
    setResult(undefined);
    if (file && !title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = form.get("file");
    if ((!file || !(file instanceof File) || file.size === 0) && !String(form.get("text") || "").trim()) {
      setMessage("Paste Arabic text or choose a file to continue.");
      setMessageKind("error");
      return;
    }
    setBusy(true);
    setMessage(undefined);
    setMessageKind(undefined);
    try {
      const response = await fetch("/api/sources/import", { method: "POST", body: form });
      const imported = (await response.json()) as {
        error?: string;
        importedSections?: number;
        totalPages?: number;
        promptPageCount?: number;
        duplicate?: boolean;
      };
      if (!response.ok) throw new Error(imported.error || "The source could not be imported.");
      const summary = {
        importedSections: imported.importedSections || 1,
        totalPages: imported.totalPages || 1,
        promptPageCount: imported.promptPageCount || 0,
        duplicate: imported.duplicate,
      };
      setResult(summary);
      setMessage(imported.duplicate ? "This book was already in your library. Its first unit is now on this conversation’s table." : "The source is ready for conversation.");
      setMessageKind("success");
      await onImported(conversationId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The source could not be imported.");
      setMessageKind("error");
    } finally {
      setBusy(false);
    }
  };

  const updateAttachment = async (source: SourceDocument, attached: boolean) => {
    setUpdatingSourceId(source.id);
    setLibraryMessage(undefined);
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/sources/${encodeURIComponent(source.id)}`, {
        method: attached ? "DELETE" : "POST",
      });
      const updated = await response.json() as { error?: string };
      if (!response.ok) throw new Error(updated.error || "The source could not be updated.");
      setLibraryMessage(attached
        ? `Removed “${source.title}” from this conversation. It remains in your library.`
        : `Attached “${source.title}” to this conversation.`);
      await onImported(conversationId);
    } catch (error) {
      setLibraryMessage(error instanceof Error ? error.message : "The source could not be updated.");
    } finally {
      setUpdatingSourceId(undefined);
    }
  };

  return (
    <div className="sources-view">
      <header className="section-header">
        <button className="back-button" onClick={onBack}><ArrowLeft size={17} /> Conversation</button>
        <div><span className="eyebrow">YOUR READING TABLE</span><h1>Texts that can become conversation</h1><p>Upload a chapter or attach an existing source directly to the conversation you are in.</p></div>
        <button className="primary-button header-upload" onClick={() => setOpen(true)}><Plus size={17} /> Upload to this conversation</button>
      </header>

      <section className="current-source-context" aria-label="Current conversation source attachments">
        <span className="context-seal"><Paperclip size={17} /></span>
        <div><small>CURRENT CONVERSATION</small><strong dir="auto">{conversationTitle}</strong></div>
        <span className="context-count"><b>{activeSourceIds.length}</b> {activeSourceIds.length === 1 ? "source attached" : "sources attached"}</span>
      </section>

      {libraryMessage && <p className="source-library-message" role="status">{libraryMessage}</p>}

      <div className="source-library-grid">
        {sources.map((source, index) => {
          const attached = activeSourceIds.includes(source.id);
          return (
          <article className={attached ? "source-book active" : "source-book"} key={source.id}>
            <div className="book-spine"><span>{String(index + 1).padStart(2, "0")}</span><i /></div>
            <div className="book-content">
              {source.collectionTitle && <span className="source-collection"><Layers3 size={13} /> {source.collectionTitle}</span>}
              <span className="source-genre">{source.genre}{attached ? " · attached here" : ""}</span>
              <h2 dir="rtl">{source.title}</h2>
              <p dir="rtl">{source.author}</p>
              <blockquote dir="rtl">{source.passages.find((passage) => passage.arabic.length > 120)?.arabic || source.passages[0]?.arabic}</blockquote>
              <div className="book-meta">
                <span><BookOpen size={15} /> {source.pageStart ? `PDF pp. ${source.pageStart}–${source.pageEnd}` : `${source.passages.length} passages`}</span>
                <span><Check size={15} /> {source.promptPageCount ? `${source.promptPageCount} prompt pages` : "provenance kept"}</span>
              </div>
              <button
                className={attached ? "source-attach attached" : "source-attach"}
                onClick={() => void updateAttachment(source, attached)}
                disabled={Boolean(updatingSourceId)}
                aria-label={attached ? `Remove ${source.title} from current conversation` : `Attach ${source.title} to current conversation`}
              >
                {updatingSourceId === source.id
                  ? <><LoaderCircle className="source-action-spinner" size={15} /> Updating…</>
                  : attached
                    ? <><Unlink size={15} /> Remove from this conversation</>
                    : <><Link2 size={15} /> Attach to this conversation</>}
              </button>
            </div>
          </article>
        );})}
        <button className="source-add-card" onClick={() => setOpen(true)}><UploadCloud size={28} /><strong>Upload into this conversation</strong><span>Arabic text, PDF, or page image</span></button>
      </div>

      <section className="source-policy">
        <div><span className="eyebrow">HOW SOURCES ARE HELD</span><h2>The text remains the authority for what it says.</h2></div>
        <div className="claim-kinds"><span><i className="verified" /> verified quotation</span><span><i className="paraphrase" /> source paraphrase</span><span><i className="background" /> attributed background</span><span><i className="illustrative" /> language prompt</span></div>
      </section>

      {open && (
        <div className="dialog-backdrop" onMouseDown={closeDialog}>
          <form className="source-dialog" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
            <input type="hidden" name="conversationId" value={conversationId} />
            <div className="dialog-heading"><div><span className="eyebrow">NEW SOURCE · {conversationTitle}</span><h2>Attach a file to this conversation</h2></div><button type="button" className="back-button" onClick={closeDialog}>Close</button></div>
            {!result ? (
              <>
                <div className="form-grid"><label><span>Book or text title <small>filled from the file</small></span><input name="title" dir="auto" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="مَنَازِلُ السَّائِرِينَ" /></label><label><span>Author</span><input name="author" dir="rtl" placeholder="عَبْدُ اللهِ الْهَرَوِيُّ" /></label><label><span>Genre</span><select name="genre" defaultValue="study text"><option value="study text">Course or study text</option><option value="tazkiya">Tazkiya</option><option value="tafsir">Tafsīr</option><option value="quranic study">Qurʾānic study</option><option value="literature">Literature</option></select></label><label><span>Edition or class</span><input name="edition" placeholder="Qasid CSA 502, spring term…" /></label></div>
                <label className="text-area-label"><span>Paste Arabic text</span><textarea name="text" dir="rtl" rows={5} placeholder="اِلْصِقِ النَّصَّ الْعَرَبِيَّ هُنَا…" /></label>
                <div className="upload-divider"><span>or upload</span></div>
                <label className={selectedFileName ? "file-drop has-file" : "file-drop"}>
                  <input type="file" name="file" accept=".txt,.md,.pdf,image/*" onChange={chooseFile} />
                  <span>{selectedFileName ? <FileCheck2 size={27} /> : <><FileText size={22} /><FileImage size={22} /></>}</span>
                  <strong>{selectedFileName || "Choose a PDF, text file, or page image"}</strong>
                  <small>{selectedFileName?.toLowerCase().endsWith(".pdf") ? "Course-book units and discussion prompts will be indexed by page." : "Image OCR uses the configured reflective model."}</small>
                </label>
                {busy && <div className="import-progress" role="status"><LoaderCircle size={18} /><span><strong>Reading the book page by page…</strong><small>Finding units, page ranges, and places that invite conversation.</small></span></div>}
                {message && <p className={`form-message ${messageKind || ""}`} role={messageKind === "error" ? "alert" : "status"}>{message}</p>}
                <button className="primary-button submit-source" disabled={busy}>{busy ? "Indexing the course book…" : "Upload and attach"}</button>
              </>
            ) : (
              <div className="import-success" role="status">
                <span className="success-seal"><Check size={24} /></span>
                <div><span className="eyebrow">SOURCE READY</span><h3>{result.importedSections > 1 ? `${result.importedSections} units found` : "Text imported"}</h3><p>{message}</p></div>
                <dl><div><dt>Pages read</dt><dd>{result.totalPages}</dd></div><div><dt>Conversation units</dt><dd>{result.importedSections}</dd></div><div><dt>Prompt-rich pages</dt><dd>{result.promptPageCount}</dd></div></dl>
                <p className="import-next-step">The first indexed unit is attached to this conversation. If the file contains several chapters, attach any additional unit from its card below.</p>
                <button type="button" className="primary-button" onClick={closeDialog}>See the indexed units</button>
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
