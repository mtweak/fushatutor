"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Clock3, Headphones, Search, Sparkles, Volume2 } from "lucide-react";
import type { VocabularyItem, VocabularyStatus } from "@/lib/types";
import { playArabic } from "@/lib/play-arabic";

const filters: Array<{ id: "all" | VocabularyStatus; label: string }> = [
  { id: "all", label: "All words" },
  { id: "to_acquire", label: "To acquire" },
  { id: "learning", label: "Learning" },
  { id: "mastered", label: "Mastered" },
];

export function VocabularyView({ items, onBack }: { items: VocabularyItem[]; onBack: () => void }) {
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(items[0]?.id);
  const visible = useMemo(
    () => items.filter((item) => (filter === "all" || item.status === filter) && `${item.vocalized} ${item.englishGloss} ${item.root}`.toLowerCase().includes(query.toLowerCase())),
    [filter, items, query],
  );
  const current = visible.find((item) => item.id === selected) ?? visible[0];

  return (
    <div className="library-view">
      <header className="section-header">
        <button className="back-button" onClick={onBack}><ArrowLeft size={17} /> Conversation</button>
        <div><span className="eyebrow">YOUR ACTIVE LEXICON</span><h1>Words that can enter the room</h1><p>Understanding is only the first threshold. The goal is fast, fitting, independent use.</p></div>
        <div className="section-stat"><strong>{items.filter((item) => item.status === "learning").length}</strong><span>in active motion</span></div>
      </header>

      <div className="library-toolbar">
        <div className="filter-tabs">{filters.map((item) => <button key={item.id} className={filter === item.id ? "active" : ""} onClick={() => setFilter(item.id)}>{item.label}<small>{item.id === "all" ? items.length : items.filter((word) => word.status === item.id).length}</small></button>)}</div>
        <label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search root, word, or meaning" /></label>
      </div>

      <div className="vocabulary-layout">
        <div className="word-list">
          {visible.map((item) => (
            <button key={item.id} className={current?.id === item.id ? "word-row selected" : "word-row"} onClick={() => setSelected(item.id)}>
              <span className={`word-status ${item.status}`} />
              <span className="word-arabic" dir="rtl">{item.vocalized}<small>{item.root}</small></span>
              <span className="word-meaning">{item.englishGloss}<small>{item.sourceLabel}</small></span>
              <span className="word-mastery"><i><b style={{ width: `${Math.round(item.production * 100)}%` }} /></i><small>{Math.round(item.production * 100)}% active</small></span>
            </button>
          ))}
          {!visible.length && <div className="empty-list"><Search size={24} /><strong>No words match this view.</strong><span>Try another meaning or root.</span></div>}
        </div>

        {current && (
          <aside className="word-detail">
            <div className="detail-head">
              <span className={`status-pill ${current.status}`}>{statusCopy(current.status)}</span>
              <button className="round-sound" onClick={() => void playArabic(current.vocalized)} aria-label="Hear AI pronunciation"><Volume2 size={18} /></button>
            </div>
            <h2 dir="rtl">{current.vocalized}</h2>
            <div className="root-line"><span>ROOT</span><strong>{current.root}</strong><i /></div>
            <p className="primary-sense">{current.englishGloss}</p>
            {current.technicalGloss && <p className="technical-sense"><Sparkles size={15} /><span><strong>In this literature</strong>{current.technicalGloss}</span></p>}

            <div className="mastery-grid">
              <Mastery label="Heard & understood" value={current.comprehension} icon={<Headphones size={15} />} />
              <Mastery label="Spoken independently" value={current.production} icon={<Volume2 size={15} />} />
              <Mastery label="Automaticity" value={current.automaticity} icon={<Clock3 size={15} />} />
            </div>

            <section className="collocation-block"><span className="eyebrow">IT LIKES TO TRAVEL WITH</span>{current.collocations.map((item) => <button key={item} dir="rtl" onClick={() => void playArabic(item)}>{item}<Volume2 size={13} /></button>)}</section>
            <section className="example-block"><span className="eyebrow">ONE LIVING EXAMPLE</span><blockquote dir="rtl">{current.examples[0]}</blockquote></section>
            <footer className="review-footer"><Clock3 size={15} /><span><strong>{reviewCopy(current)}</strong>Retrieval is scheduled by predicted memory, not a fixed deck.</span></footer>
          </aside>
        )}
      </div>
    </div>
  );
}

function Mastery({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div><span>{icon}{label}</span><strong>{Math.round(value * 100)}%</strong><i><b style={{ width: `${value * 100}%` }} /></i></div>;
}

function statusCopy(status: VocabularyStatus) {
  return { to_acquire: "To acquire", learning: "In active learning", mastered: "Durably mastered" }[status];
}

function reviewCopy(item: VocabularyItem) {
  if (!item.nextReview) return "No review scheduled";
  const days = Math.ceil((new Date(item.nextReview).getTime() - Date.now()) / 86_400_000);
  return days <= 0 ? "Ready to reappear today" : `Likely to reappear in ${days} day${days === 1 ? "" : "s"}`;
}
