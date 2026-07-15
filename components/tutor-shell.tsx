"use client";

import { useCallback, useRef, useState } from "react";
import {
  BarChart3,
  CircleHelp,
  Headphones,
  Languages,
  LibraryBig,
  MessageCircleMore,
  Settings2,
  X,
} from "lucide-react";
import { useRealtimeTutor } from "@/hooks/use-realtime-tutor";
import type {
  BootstrapData,
  ConversationTurn,
  GlossToken,
  LearningThread,
  Preferences,
  SessionView,
  TurnMetrics,
} from "@/lib/types";
import { SessionWorkspace } from "@/components/session-workspace";
import { VocabularyView } from "@/components/vocabulary-view";
import { ProgressView } from "@/components/progress-view";
import { SourcesView } from "@/components/sources-view";
import { ConversationShelf } from "@/components/conversation-shelf";

const navItems: Array<{ id: SessionView; label: string; arabic: string; icon: typeof MessageCircleMore }> = [
  { id: "session", label: "Conversation", arabic: "الْمَجْلِسُ", icon: MessageCircleMore },
  { id: "vocabulary", label: "Vocabulary", arabic: "الْمُفْرَدَاتُ", icon: Languages },
  { id: "progress", label: "Progress", arabic: "التَّقَدُّمُ", icon: BarChart3 },
  { id: "sources", label: "Sources", arabic: "النُّصُوصُ", icon: LibraryBig },
];

export function TutorShell({ initialData }: { initialData: BootstrapData }) {
  const [data, setData] = useState<BootstrapData>(initialData);
  const [view, setView] = useState<SessionView>("session");
  const [selectedGloss, setSelectedGloss] = useState<GlossToken>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [conversationShelfOpen, setConversationShelfOpen] = useState(false);
  const [notice, setNotice] = useState<string>();
  const activeConversationIdRef = useRef(initialData.activeConversationId);

  const refresh = useCallback(async (conversationId?: string) => {
    const targetId = conversationId || activeConversationIdRef.current;
    const response = await fetch(`/api/bootstrap?conversationId=${encodeURIComponent(targetId)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("The learning record could not be loaded.");
    const next = (await response.json()) as BootstrapData;
    activeConversationIdRef.current = next.activeConversationId;
    setData(next);
  }, []);

  const onLearnerTranscript = useCallback(
    async (text: string, mode: "realtime" | "demo", metrics?: TurnMetrics) => {
      const response = await fetch("/api/turns/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConversationIdRef.current,
          transcript: text,
          role: "learner",
          mode,
          metrics: { asrConfidence: mode === "realtime" ? 0.82 : 0.74, ...metrics },
        }),
      });
      const result = (await response.json()) as {
        turn?: ConversationTurn;
        tutorTurn?: ConversationTurn;
        error?: string;
      };
      if (!response.ok || !result.turn) throw new Error(result.error || "The turn could not be finalized.");
      setData((current) => {
        const turns = [...current.turns.filter((turn) => turn.id !== result.turn?.id), result.turn!];
        if (result.tutorTurn) turns.push(result.tutorTurn);
        return { ...current, turns };
      });
      window.setTimeout(() => void refresh(), 350);
      return result.tutorTurn?.arabic;
    },
    [refresh],
  );

  const onTutorTranscript = useCallback(
    async (text: string) => {
      const response = await fetch("/api/turns/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeConversationIdRef.current, transcript: text, role: "tutor", mode: "realtime" }),
      });
      const result = (await response.json()) as { turn?: ConversationTurn };
      if (result.turn) {
        setData((current) =>
          ({ ...current, turns: [...current.turns.filter((turn) => turn.id !== result.turn?.id), result.turn!] }),
        );
      }
    },
    [],
  );

  const voice = useRealtimeTutor({
    conversationId: data.activeConversationId,
    onLearnerTranscript,
    onTutorTranscript,
    onDataChanged: refresh,
  });

  const selectConversation = useCallback(async (conversationId: string) => {
    voice.stop();
    const response = await fetch(`/api/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ open: true }),
    });
    if (!response.ok) throw new Error("That conversation could not be opened.");
    activeConversationIdRef.current = conversationId;
    await refresh(conversationId);
    setView("session");
    setSelectedGloss(undefined);
    setConversationShelfOpen(false);
  }, [refresh, voice]);

  const createConversation = useCallback(async (input: { title: string; topicSeed?: string; sourceIds: string[] }) => {
    const response = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const result = await response.json() as { conversation?: { id: string }; error?: string };
    if (!response.ok || !result.conversation) throw new Error(result.error || "The conversation could not be created.");
    await selectConversation(result.conversation.id);
  }, [selectConversation]);

  const updateConversation = useCallback(async (
    conversationId: string,
    input: { title: string; topicSeed?: string; sourceIds: string[] },
  ) => {
    const response = await fetch(`/api/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error("The conversation could not be updated.");
    await refresh(activeConversationIdRef.current);
  }, [refresh]);

  const submitText = useCallback(
    async (text: string) => {
      try {
        const reply = await onLearnerTranscript(text, "demo");
        if (reply) voice.speakDemo(reply);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "The turn could not be sent.");
      }
    },
    [onLearnerTranscript, voice],
  );

  const updateThread = useCallback(
    async (thread: LearningThread, action: "pin" | "dismiss") => {
      const response = await fetch(`/api/threads/${thread.id}/${action}`, { method: "POST" });
      if (!response.ok) {
        setNotice("That learning thread could not be updated.");
        return;
      }
      await refresh();
    },
    [refresh],
  );

  const savePreferences = useCallback(
    async (preferences: Partial<Preferences>) => {
      const response = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferences),
      });
      if (!response.ok) {
        setNotice("Preferences could not be saved.");
        return;
      }
      setSettingsOpen(false);
      await refresh();
    },
    [refresh],
  );

  const activeThread = data.threads.find((thread) => thread.status === "active" || thread.status === "woven_in");

  return (
    <main className="app-shell">
      <header className="app-header">
        <button className="brand" onClick={() => setConversationShelfOpen(true)} aria-label="Open conversation shelf">
          <span className="brand-mark" aria-hidden="true">م</span>
          <span>
            <strong dir="rtl">مِرْقَاةُ الْبَيَانِ</strong>
            <small>Literary Arabic, in motion</small>
          </span>
        </button>

        <nav className="primary-nav" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? "nav-item active" : "nav-item"}
                onClick={() => setView(item.id)}
                aria-current={view === item.id ? "page" : undefined}
              >
                <Icon size={17} />
                <span>{item.label}</span>
                <em dir="rtl">{item.arabic}</em>
              </button>
            );
          })}
        </nav>

        <div className="header-actions">
          <span className={data.configured ? "connection-tag live" : "connection-tag demo"}>
            <i /> {data.configured ? "Realtime ready" : "Browser demo"}
          </span>
          <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Open settings">
            <Settings2 size={19} />
          </button>
        </div>
      </header>

      <div className="view-stage">
        {view === "session" && (
          <SessionWorkspace
            data={data}
            voice={voice}
            activeThread={activeThread}
            selectedGloss={selectedGloss}
            onSelectGloss={setSelectedGloss}
            onSubmitText={submitText}
            onThreadAction={updateThread}
            onOpenVocabulary={() => setView("vocabulary")}
            onOpenSources={() => setView("sources")}
          />
        )}
        {view === "vocabulary" && <VocabularyView items={data.vocabulary} onBack={() => setView("session")} />}
        {view === "progress" && (
          <ProgressView progress={data.progress} competencies={data.competencies} onBack={() => setView("session")} />
        )}
        {view === "sources" && (
          <SourcesView
            sources={data.sourceLibrary}
            activeSourceIds={data.sources.map((source) => source.id)}
            conversationId={data.activeConversationId}
            conversationTitle={data.conversations.find((conversation) => conversation.id === data.activeConversationId)?.title || "Current conversation"}
            onImported={refresh}
            onBack={() => setView("session")}
          />
        )}
      </div>

      <ConversationShelf
        open={conversationShelfOpen}
        conversations={data.conversations}
        activeConversationId={data.activeConversationId}
        sources={data.sourceLibrary}
        onClose={() => setConversationShelfOpen(false)}
        onSelect={selectConversation}
        onCreate={createConversation}
        onUpdate={updateConversation}
      />

      {notice && (
        <div className="notice" role="status">
          <CircleHelp size={18} />
          <span>{notice}</span>
          <button onClick={() => setNotice(undefined)} aria-label="Dismiss"><X size={16} /></button>
        </div>
      )}

      {settingsOpen && (
        <SettingsDialog preferences={data.preferences} configured={data.configured} onClose={() => setSettingsOpen(false)} onSave={savePreferences} />
      )}
    </main>
  );
}

function SettingsDialog({
  preferences,
  configured,
  onClose,
  onSave,
}: {
  preferences: Preferences;
  configured: boolean;
  onClose: () => void;
  onSave: (preferences: Partial<Preferences>) => void;
}) {
  const [draft, setDraft] = useState(preferences);
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">SESSION CHARACTER</span>
            <h2 id="settings-title">How the tutor meets you</h2>
          </div>
          <button className="icon-button dark" onClick={onClose} aria-label="Close settings"><X size={19} /></button>
        </div>

        <label className="setting-row">
          <span><strong>Session length</strong><small>A soft boundary; learner-led threads may continue.</small></span>
          <select value={draft.sessionMinutes} onChange={(event) => setDraft({ ...draft, sessionMinutes: Number(event.target.value) })}>
            <option value={10}>10 minutes</option>
            <option value={20}>20 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={45}>45 minutes</option>
          </select>
        </label>
        <label className="setting-row">
          <span><strong>English glosses</strong><small>Arabic remains visually primary.</small></span>
          <select value={draft.glossMode} onChange={(event) => setDraft({ ...draft, glossMode: event.target.value as Preferences["glossMode"] })}>
            <option value="tap">Reveal on tap</option>
            <option value="always">Always visible</option>
            <option value="hidden">Hidden</option>
          </select>
        </label>
        <label className="setting-row">
          <span><strong>Tutor voice</strong><small>The new voice begins with your next live session.</small></span>
          <select value={draft.voice} onChange={(event) => setDraft({ ...draft, voice: event.target.value })}>
            <option value="cedar">Cedar · deeper</option>
            <option value="marin">Marin · brighter</option>
          </select>
        </label>
        <label className="setting-row switch-row">
          <span><strong>Adaptive engagement</strong><small>Respond to likely flow, overload, or loss of interest.</small></span>
          <input type="checkbox" checked={draft.engagementAdaptation} onChange={(event) => setDraft({ ...draft, engagementAdaptation: event.target.checked })} />
        </label>
        <label className="setting-row switch-row">
          <span><strong>Explain when asked</strong><small>Keep correction implicit unless you request an explanation.</small></span>
          <input type="checkbox" checked={draft.explicitExplanations} onChange={(event) => setDraft({ ...draft, explicitExplanations: event.target.checked })} />
        </label>
        <div className="privacy-note">
          <Headphones size={19} />
          <p><strong>{configured ? "Live voice is configured." : "Demo voice is active."}</strong> Raw microphone audio is never stored. Transcripts and learning evidence remain on this computer.</p>
        </div>
        <div className="dialog-actions">
          <button className="quiet-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" onClick={() => onSave(draft)}>Save preferences</button>
        </div>
      </section>
    </div>
  );
}
