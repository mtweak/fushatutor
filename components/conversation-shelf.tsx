"use client";

import { FormEvent, useState } from "react";
import { BookOpen, ChevronRight, MessageCircleMore, PenLine, Plus, X } from "lucide-react";
import type { ConversationThread, SourceDocument } from "@/lib/types";

export function ConversationShelf({
  open,
  conversations,
  activeConversationId,
  sources,
  onClose,
  onSelect,
  onCreate,
  onUpdate,
}: {
  open: boolean;
  conversations: ConversationThread[];
  activeConversationId: string;
  sources: SourceDocument[];
  onClose: () => void;
  onSelect: (id: string) => Promise<void>;
  onCreate: (input: { title: string; topicSeed?: string; sourceIds: string[] }) => Promise<void>;
  onUpdate: (id: string, input: { title: string; topicSeed?: string; sourceIds: string[] }) => Promise<void>;
}) {
  const [editor, setEditor] = useState<"new" | ConversationThread>();

  if (!open) return null;

  const closeShelf = () => {
    setEditor(undefined);
    onClose();
  };

  return (
    <>
      <div className="shelf-backdrop" onMouseDown={closeShelf}>
        <aside className="conversation-shelf" role="dialog" aria-modal="true" aria-label="Conversation threads" onMouseDown={(event) => event.stopPropagation()}>
          <header className="shelf-heading">
            <div>
              <span className="eyebrow">YOUR CONVERSATION FOLIOS</span>
              <h2>Choose a line of thought</h2>
            </div>
            <button className="icon-button dark" onClick={closeShelf} aria-label="Close conversations"><X size={18} /></button>
          </header>

          <button className="new-conversation" onClick={() => setEditor("new")}>
            <Plus size={17} />
            <span><strong>Begin another conversation</strong><small>A fresh topic, context, and reading table</small></span>
          </button>

          <div className="conversation-folios">
            {conversations.map((conversation, index) => {
              const active = conversation.id === activeConversationId;
              return (
                <article className={active ? "conversation-folio active" : "conversation-folio"} key={conversation.id}>
                  <button className="folio-main" onClick={() => { setEditor(undefined); void onSelect(conversation.id); }}>
                    <span className="folio-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className="folio-copy">
                      <strong dir="auto">{conversation.title}</strong>
                      <small>{conversation.topicSeed || "An open literary-Arabic conversation"}</small>
                      <em>
                        {conversation.sourceLabels.length ? <><BookOpen size={12} /> {conversation.sourceLabels.join(" · ")}</> : <><MessageCircleMore size={12} /> No source attached</>}
                        <b>{conversation.turnCount} turns</b>
                      </em>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                  <button className="folio-edit" onClick={() => setEditor(conversation)} aria-label={`Edit ${conversation.title}`}><PenLine size={14} /></button>
                </article>
              );
            })}
          </div>

          <footer className="shelf-footer">
            <i />
            <p><strong>One learner, many contexts.</strong> Vocabulary and fluency mastery travel with you; topic history and source material stay in their own folio.</p>
          </footer>
        </aside>
      </div>

      {editor && (
        <ConversationEditor
          conversation={editor === "new" ? undefined : editor}
          sources={sources}
          onClose={() => setEditor(undefined)}
          onSubmit={async (input) => {
            if (editor === "new") await onCreate(input);
            else await onUpdate(editor.id, input);
            setEditor(undefined);
          }}
        />
      )}
    </>
  );
}

function ConversationEditor({
  conversation,
  sources,
  onClose,
  onSubmit,
}: {
  conversation?: ConversationThread;
  sources: SourceDocument[];
  onClose: () => void;
  onSubmit: (input: { title: string; topicSeed?: string; sourceIds: string[] }) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [selectedSources, setSelectedSources] = useState<string[]>(conversation?.sourceIds ?? []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const form = new FormData(event.currentTarget);
    try {
      await onSubmit({
        title: String(form.get("title") || ""),
        topicSeed: String(form.get("topicSeed") || "") || undefined,
        sourceIds: selectedSources,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The conversation could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop conversation-editor-backdrop" onMouseDown={onClose}>
      <form className="conversation-dialog" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-heading">
          <div><span className="eyebrow">{conversation ? "EDIT FOLIO" : "NEW CONVERSATION"}</span><h2>{conversation ? "Refine this line of thought" : "Open a fresh line of thought"}</h2></div>
          <button type="button" className="icon-button dark" onClick={onClose} aria-label="Close editor"><X size={18} /></button>
        </div>
        <label className="conversation-field"><span>Conversation title</span><input name="title" required maxLength={120} defaultValue={conversation?.title} placeholder="تَفْسِيرُ سُورَةِ يُوسُفَ" dir="auto" /></label>
        <label className="conversation-field"><span>What should this conversation explore?</span><textarea name="topicSeed" rows={4} defaultValue={conversation?.topicSeed} placeholder="Practice summarizing the chapter, explaining its key terms, and responding to likely majlis questions." /></label>
        <fieldset className="source-picker">
          <legend>Place source material on this conversation’s table <small>optional</small></legend>
          {sources.length ? sources.map((source) => (
            <label key={source.id}>
              <input
                type="checkbox"
                checked={selectedSources.includes(source.id)}
                onChange={(event) => setSelectedSources((current) => event.target.checked ? [...current, source.id] : current.filter((id) => id !== source.id))}
              />
              <span>
                <strong dir="auto">{source.collectionTitle ? `${source.collectionTitle} — ${source.title}` : source.title}</strong>
                <small>{source.author || source.genre} · {source.pageStart ? `PDF pp. ${source.pageStart}–${source.pageEnd}` : `${source.passages.length} passages`}</small>
              </span>
            </label>
          )) : <p>No source texts yet. You can attach one later from the Sources table.</p>}
        </fieldset>
        {error && <p className="form-message">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="quiet-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" disabled={busy}>{busy ? "Binding the folio…" : conversation ? "Save conversation" : "Begin conversation"}</button>
        </div>
      </form>
    </div>
  );
}
