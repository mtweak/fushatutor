"use client";

import { ArrowLeft, ArrowUpRight, BookOpenCheck, Clock3, MessageCircleMore, Mic2, TrendingUp } from "lucide-react";
import type { LearnerState, ProgressSummary } from "@/lib/types";

export function ProgressView({ progress, competencies, onBack }: { progress: ProgressSummary; competencies: LearnerState[]; onBack: () => void }) {
  const strongest = [...competencies].sort((a, b) => b.masteryProbability - a.masteryProbability)[0];
  const focus = progress.nextFocus;
  return (
    <div className="progress-view">
      <header className="section-header progress-header">
        <button className="back-button" onClick={onBack}><ArrowLeft size={17} /> Conversation</button>
        <div><span className="eyebrow">MAJLIS READINESS</span><h1>Fluency is becoming less deliberate.</h1><p>This profile separates what you understand from what you can retrieve under the pressure of a real turn.</p></div>
        <div className="readiness-seal"><span>{progress.majlisReadiness}</span><small>readiness</small><i>+6 this month</i></div>
      </header>

      <section className="progress-ribbon">
        <Metric icon={<Mic2 size={18} />} value={`${progress.learnerSpeechShare}%`} label="of conversation is yours" note="target ≥ 60%" />
        <Metric icon={<Clock3 size={18} />} value={formatSeconds(progress.medianResponseOnsetMs, "2.8s")} label="median response start" note="difficulty-matched" />
        <Metric icon={<MessageCircleMore size={18} />} value={formatDuration(progress.longestLearnerTurnMs, "1:46")} label="longest coherent turn" note="without a stem" />
        <Metric icon={<BookOpenCheck size={18} />} value={`${progress.masteredVocabulary}`} label="durable active words" note={`${progress.activeVocabulary} learning now`} />
      </section>

      <div className="progress-grid">
        <section className="readiness-map">
          <div className="block-heading"><div><span className="eyebrow">THE SHAPE OF YOUR ARABIC</span><h2>One language, several kinds of knowing</h2></div><span className="trend-tag"><TrendingUp size={14} /> moving</span></div>
          <div className="dimension-list">
            {progress.dimensions.map((dimension) => (
              <div className="dimension" key={dimension.id}>
                <div><strong>{dimension.label}</strong><span dir="rtl">{dimension.arabicLabel}</span></div>
                <div className="dimension-track"><i style={{ width: `${dimension.value}%` }} /><b style={{ left: `${Math.max(1, dimension.value - dimension.trend)}%` }} /></div>
                <strong>{dimension.value}</strong>
                <small>+{dimension.trend}</small>
              </div>
            ))}
          </div>
          <footer><i /> A score moves only after repeated, high-confidence evidence. One difficult turn cannot lower your profile.</footer>
        </section>

        <aside className="next-frontier">
          <span className="eyebrow">THE NEXT FRONTIER</span>
          <h2>{focus.label}</h2>
          <p>{focus.rationale}</p>
          <div className="frontier-compare">
            <span><small>{strongest?.label || "Established strength"}</small><strong>{Math.round((strongest?.masteryProbability ?? 0) * 100)}%</strong></span>
            <i><ArrowUpRight size={17} /></i>
            <span><small>{focus.label}</small><strong>{Math.round(focus.masteryProbability * 100)}%</strong></span>
          </div>
          <blockquote dir="rtl">{focusPrompt(focus.adjustment)}</blockquote>
        </aside>

        <section className="evidence-ledger">
          <div className="block-heading"><div><span className="eyebrow">WHAT COUNTS AS EVIDENCE</span><h2>Independence changes the weight</h2></div></div>
          <div className="evidence-steps">
            <Evidence value="1.00" label="Spontaneous use" detail="You chose it because the thought needed it." />
            <Evidence value=".75" label="Visual cue" detail="The meaning was present, but the word was yours." />
            <Evidence value=".55" label="English meaning" detail="Active recall with semantic support." />
            <Evidence value=".35" label="Arabic stem" detail="The construction was partially supplied." />
            <Evidence value=".20" label="Immediate echo" detail="Useful rehearsal, not yet ownership." />
          </div>
        </section>

        <aside className="privacy-progress">
          <span className="eyebrow">A QUIET PROMISE</span>
          <h2>No mood labels.</h2>
          <p>The app may adapt when several signals suggest overload or lost interest. It does not claim you “were bored.” It learns only practical preferences such as:</p>
          <ul><li>Responds well to short role-play</li><li>Needs more space before answering</li><li>Retains abstract words through contrast</li></ul>
        </aside>
      </div>
    </div>
  );
}

function Metric({ icon, value, label, note }: { icon: React.ReactNode; value: string; label: string; note: string }) {
  return <div className="metric-card"><span>{icon}</span><strong>{value}</strong><p>{label}</p><small>{note}</small></div>;
}

function Evidence({ value, label, detail }: { value: string; label: string; detail: string }) {
  return <div><strong>{value}</strong><span><b>{label}</b><small>{detail}</small></span></div>;
}

function formatSeconds(value: number | undefined, fallback: string) {
  return value === undefined ? fallback : `${(value / 1_000).toFixed(1)}s`;
}

function formatDuration(value: number | undefined, fallback: string) {
  if (value === undefined) return fallback;
  const seconds = Math.round(value / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function focusPrompt(adjustment: ProgressSummary["nextFocus"]["adjustment"]) {
  if (adjustment === "downshift") return "لِنَأْخُذْ فِكْرَةً وَاحِدَةً، ثُمَّ نَبْنِي عَلَيْهَا.";
  if (adjustment === "upshift") return "قُلْهَا مَرَّةً أُخْرَى بِدِقَّةٍ أَكْبَرَ وَمِنْ غَيْرِ مُسَاعَدَةٍ.";
  return "اِسْمَعْ أَوَّلًا، ثُمَّ قُلْهَا بِطَرِيقَتِكَ.";
}
