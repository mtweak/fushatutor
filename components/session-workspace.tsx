"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  BookMarked,
  Bookmark,
  ChevronRight,
  CircleStop,
  CornerDownLeft,
  Headphones,
  Languages,
  Lightbulb,
  Mic,
  MicOff,
  Pin,
  RotateCcw,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";
import type { useRealtimeTutor } from "@/hooks/use-realtime-tutor";
import type { BootstrapData, GlossToken, LearningThread } from "@/lib/types";
import { alignDisplayTokens } from "@/lib/turn-display";
import { playArabic } from "@/lib/play-arabic";
import { needsGlossLookup } from "@/lib/arabic";
import { isPushToTalkKey } from "@/lib/push-to-talk";

type VoiceController = ReturnType<typeof useRealtimeTutor>;

export function SessionWorkspace({
  data,
  voice,
  activeThread,
  selectedGloss,
  onSelectGloss,
  onSubmitText,
  onThreadAction,
  onOpenVocabulary,
  onOpenSources,
}: {
  data: BootstrapData;
  voice: VoiceController;
  activeThread?: LearningThread;
  selectedGloss?: GlossToken;
  onSelectGloss: (gloss?: GlossToken) => void;
  onSubmitText: (text: string) => Promise<void>;
  onThreadAction: (thread: LearningThread, action: "pin" | "dismiss") => Promise<void>;
  onOpenVocabulary: () => void;
  onOpenSources: () => void;
}) {
  const passage = data.sources[0]?.passages[0];
  const conversation = data.conversations.find((item) => item.id === data.activeConversationId);
  const conversationRef = useRef<HTMLDivElement>(null);
  const glossCacheRef = useRef(new Map<string, GlossToken>());
  const glossRequestRef = useRef(0);
  const [lookingUpGloss, setLookingUpGloss] = useState(false);
  const [glossError, setGlossError] = useState<string>();

  useEffect(() => {
    conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight, behavior: "smooth" });
  }, [data.turns.length, voice.interimTranscript]);

  const selectGloss = async (gloss: GlossToken, context: string) => {
    const requestId = glossRequestRef.current + 1;
    glossRequestRef.current = requestId;
    setGlossError(undefined);
    onSelectGloss(gloss);
    if (!needsGlossLookup(gloss)) {
      setLookingUpGloss(false);
      return;
    }

    const cacheKey = `${gloss.arabic}\n${context}`;
    const cached = glossCacheRef.current.get(cacheKey);
    if (cached) {
      onSelectGloss(cached);
      setLookingUpGloss(false);
      return;
    }

    setLookingUpGloss(true);
    try {
      const response = await fetch("/api/gloss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: gloss.arabic, context }),
      });
      const result = await response.json() as { gloss?: GlossToken; error?: string };
      if (!response.ok || !result.gloss) throw new Error(result.error || "Meaning unavailable");
      glossCacheRef.current.set(cacheKey, result.gloss);
      if (glossRequestRef.current === requestId) onSelectGloss(result.gloss);
    } catch {
      if (glossRequestRef.current === requestId) setGlossError("I couldn't find this meaning. Tap the word to try again.");
    } finally {
      if (glossRequestRef.current === requestId) setLookingUpGloss(false);
    }
  };

  const closeGloss = () => {
    glossRequestRef.current += 1;
    setLookingUpGloss(false);
    setGlossError(undefined);
    onSelectGloss(undefined);
  };

  return (
    <div className="session-layout">
      <aside className="source-margin">
        <div className="panel-topline">
          <span className="eyebrow">THE ANCHOR</span>
          <button className="text-icon-button" onClick={onOpenSources}><BookMarked size={15} /> Attach files</button>
        </div>
        {passage ? (
          <>
            <div className="source-title" dir="rtl">
              <small>{data.sources[0].genre}</small>
              <h2>{data.sources[0].title}</h2>
              <p>{data.sources[0].author}</p>
            </div>
            <article className="source-leaf" dir="rtl">
              <span className="leaf-number">{String(passage.sequence).padStart(2, "0")}</span>
              <p>{passage.arabic}</p>
              <footer dir="ltr">{passage.citationLabel}</footer>
            </article>
            <div className="concept-list">
              <span className="eyebrow">CONCEPTS IN VIEW</span>
              <div>{passage.concepts.map((concept) => <button key={concept} dir="rtl">{concept}</button>)}</div>
            </div>
            <button className="source-return"><RotateCcw size={15} /><span>Return here when it feels natural</span></button>
          </>
        ) : (
          <button className="empty-source" onClick={onOpenSources}><BookMarked size={28} /><strong>Add a study text</strong><span>The conversation can orbit an Arabic chapter.</span></button>
        )}
        <div className="source-ethic">
          <i />
          <p><strong>Source-aware</strong><br />Quotes and interpretations keep their provenance.</p>
        </div>
      </aside>

      <section className="conversation-column">
        <div className="conversation-heading">
          <div>
            <span className="eyebrow">LIVE CONVERSATION · ITS OWN CONTEXT</span>
            <h1 dir="auto">{conversation?.title || "مَجْلِسُ الْيَوْمِ"}</h1>
            {conversation?.topicSeed && <p className="conversation-intent">{conversation.topicSeed}</p>}
          </div>
          <div className="session-pulse">
            <span><i className={`pulse-dot ${voice.status}`} />{statusLabel(voice.status)}</span>
            <small>{data.preferences.sessionMinutes} min · learner-led</small>
          </div>
        </div>

        <div className="conversation-scroll" ref={conversationRef}>
          <div className="gold-thread" aria-hidden="true"><i /><i /><i /></div>
          <div className="gloss-hint">
            <Languages size={14} />
            <span dir="rtl">اِضْغَطْ عَلَى كَلِمَةٍ</span>
            <small>Tap any Arabic word for its English meaning</small>
          </div>
          {data.turns.map((turn) => (
            <article key={turn.id} className={`turn ${turn.role}`}>
              <div className="turn-meta">
                <span dir="rtl">{turn.role === "tutor" ? "الْمُعَلِّمُ" : "أَنْتَ"}</span>
                <time>{formatTime(turn.createdAt)}</time>
              </div>
              <p className="turn-arabic" dir="rtl">
                {turn.glosses.length
                  ? alignDisplayTokens(turn.arabic, turn.glosses).map((gloss, index) => (
                      <button
                        key={`${turn.id}-${index}`}
                        dir={gloss.isEnglishBridge ? "ltr" : "rtl"}
                        className={`${selectedGloss?.arabic === gloss.arabic ? "arabic-token selected" : "arabic-token"}${gloss.isEnglishBridge ? " english-bridge" : ""}`}
                        aria-label={`${gloss.arabic}: show English meaning`}
                        onClick={() => void selectGloss(gloss, turn.arabic)}
                      >
                        <span>{gloss.arabic}</span>
                        {data.preferences.glossMode === "always" && <small>{gloss.english}</small>}
                      </button>
                    ))
                  : turn.arabic}
              </p>
              {turn.english && <p className="turn-translation">{turn.english}</p>}
              {turn.sourceStatus === "illustrative_only" && <span className="source-badge">language prompt</span>}
            </article>
          ))}
          {voice.interimTranscript && (
            <article className="turn provisional">
              <div className="turn-meta"><span>LIVE</span><span className="typing-dots">•••</span></div>
              <p className="turn-arabic" dir="rtl">{voice.interimTranscript}</p>
            </article>
          )}
        </div>

        {selectedGloss && data.preferences.glossMode !== "hidden" && (
          <div className="inline-gloss" role="region" aria-label="English word meaning">
            <button className="close-gloss" onClick={closeGloss} aria-label="Close word meaning"><X size={15} /></button>
            <div className="gloss-word">
              <small>ARABIC</small>
              <strong dir="rtl">{selectedGloss.arabic}</strong>
            </div>
            <div className="gloss-meaning" aria-live="polite">
              <small>ENGLISH MEANING</small>
              <span className={lookingUpGloss ? "loading-meaning" : ""}>
                {lookingUpGloss ? "Finding the meaning in this sentence…" : glossError || selectedGloss.english}
              </span>
            </div>
            {selectedGloss.root && !lookingUpGloss && <em>root · <b dir="rtl">{selectedGloss.root}</b></em>}
            <button className="sound-word" onClick={() => void playArabic(selectedGloss.arabic)}><Volume2 size={15} /> Hear AI voice</button>
          </div>
        )}

        <VoiceDock voice={voice} configured={data.configured} onSubmitText={onSubmitText} />
      </section>

      <aside className="guidance-margin">
        <div className="panel-topline">
          <span className="eyebrow">THE LIVE THREAD</span>
          <span className="adaptive-tag"><Sparkles size={13} /> adapting</span>
        </div>

        {activeThread ? (
          <section className="active-thread-card">
            <div className="thread-state"><i /> following your lead</div>
            <h2 dir="rtl">{activeThread.targetArabic || "فِكْرَةٌ مِنْ حَدِيثِكَ"}</h2>
            <p>{activeThread.learnerGoal}</p>
            {activeThread.sourceBridge && <blockquote>{activeThread.sourceBridge}</blockquote>}
            <div className="thread-actions">
              <button onClick={() => onThreadAction(activeThread, "pin")}><Pin size={14} /> Keep in view</button>
              <button onClick={() => onThreadAction(activeThread, "dismiss")}><X size={14} /> Let it go</button>
            </div>
          </section>
        ) : (
          <section className="active-thread-card quiet">
            <Lightbulb size={22} />
            <h2>Say what you are reaching for.</h2>
            <p>A missing word, unfinished greeting, or “how do I say…” becomes the next path.</p>
          </section>
        )}

        <section className="concept-visual">
          <div className="visual-heading"><span className="eyebrow">A CONCEPT, NOT A DEFINITION</span><small>tap to use</small></div>
          <div className="station-visual" dir="rtl">
            <div className="visual-path"><i /><i /><i /><i /></div>
            <button className="maqam-node"><span>مَقَامٌ</span><small>what becomes established</small></button>
            <button className="hal-node"><span>حَالٌ</span><small>what passes through the heart</small></button>
          </div>
          <p dir="rtl">يَبْدُو لِي أَنَّ الْمَقَامَ…</p>
        </section>

        <section className="saved-threads">
          <div className="visual-heading"><span className="eyebrow">SAVED FOR LATER</span><small>{data.threads.filter((thread) => thread.status === "bookmarked").length}</small></div>
          {data.threads.filter((thread) => thread.status === "bookmarked").slice(0, 3).map((thread) => (
            <button key={thread.id} onClick={() => onThreadAction(thread, "pin")}>
              <Bookmark size={14} />
              <span><strong dir="rtl">{thread.targetArabic || thread.kind}</strong><small>{thread.learnerGoal}</small></span>
              <ChevronRight size={14} />
            </button>
          ))}
          <button className="all-words" onClick={onOpenVocabulary}>See your vocabulary path <ArrowUp size={14} /></button>
        </section>
      </aside>
    </div>
  );
}

function VoiceDock({ voice, configured, onSubmitText }: { voice: VoiceController; configured: boolean; onSubmitText: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [showText, setShowText] = useState(false);
  const holdingRef = useRef(false);
  const active = voice.mode !== null;

  const submit = async () => {
    const value = text.trim();
    if (!value) return;
    setText("");
    await onSubmitText(value);
  };

  const beginHolding = () => {
    if (holdingRef.current || voice.status === "error") return;
    holdingRef.current = true;
    voice.beginPushToTalk();
  };

  const endHolding = () => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    voice.endPushToTalk();
  };

  return (
    <div className="voice-dock">
      {voice.error && <div className="voice-error">{voice.error}</div>}
      {voice.needsAudioUnlock && <button className="sound-unlock" onClick={() => void voice.enableAudio()}><Volume2 size={15} /> Enable tutor sound</button>}
      {showText && (
        <div className="text-fallback">
          <input
            dir="rtl"
            lang="ar"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") void submit(); }}
            placeholder="اُكْتُبْ مَا تُرِيدُ قَوْلَهُ…"
            autoFocus
          />
          <button onClick={() => void submit()} aria-label="Send text"><CornerDownLeft size={18} /></button>
        </div>
      )}
      <div className="voice-controls">
        <button className="keyboard-toggle" onClick={() => setShowText((value) => !value)}>{showText ? "Hide text" : "Type instead"}</button>
        <div className="voice-center">
          {!active ? (
            <button className="start-voice" onClick={() => void voice.start()} disabled={voice.status === "connecting"}>
              <span><Mic size={22} /></span>
              <strong>{voice.status === "connecting" ? "Opening the majlis…" : "Begin speaking"}</strong>
              <small>{configured ? "Realtime Fuṣḥā" : "Browser voice demo"}</small>
            </button>
          ) : (
            <button
              className={`push-to-talk ${voice.microphoneOpen ? "open" : "closed"}`}
              aria-label={voice.microphoneOpen ? "Release to close microphone" : "Hold to speak"}
              aria-pressed={voice.microphoneOpen}
              disabled={voice.status === "error"}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                beginHolding();
              }}
              onPointerUp={endHolding}
              onPointerCancel={endHolding}
              onLostPointerCapture={endHolding}
              onKeyDown={(event) => {
                if (!isPushToTalkKey(event.key) || event.repeat) return;
                event.preventDefault();
                beginHolding();
              }}
              onKeyUp={(event) => {
                if (!isPushToTalkKey(event.key)) return;
                event.preventDefault();
                endHolding();
              }}
              onBlur={endHolding}
            >
              <span className="ptt-seal">{voice.microphoneOpen ? <Mic size={23} /> : <MicOff size={21} />}<i /><i /></span>
              <span className="ptt-copy">
                <strong>{voice.microphoneOpen ? "Speak now" : voice.status === "speaking" ? "Hold to interrupt" : "Hold to speak"}</strong>
                <small>{voice.microphoneOpen ? "Release when you finish" : "Microphone closed · background noise blocked"}</small>
              </span>
            </button>
          )}
        </div>
        {active ? <button className="end-session" onClick={voice.stop}><CircleStop size={16} /> End</button> : <span className="privacy-mini"><Headphones size={14} /> AI voice · audio is not stored</span>}
      </div>
    </div>
  );
}

function statusLabel(status: VoiceController["status"]) {
  return {
    idle: "Ready when you are",
    connecting: "Connecting",
    ready: "Ready—hold to speak",
    listening: "Listening while held",
    processing: "Holding your thought",
    speaking: "Tutor is speaking",
    muted: "Microphone closed",
    error: "Voice needs attention",
  }[status];
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
