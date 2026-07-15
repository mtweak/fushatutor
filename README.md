# Mirqāt al-Bayān · Fuṣḥā Tutor

A local, voice-first coach for literary Fuṣḥā speaking practice. The tutor responds to meaning before form, protects conversational momentum, models correct language sparingly, creates learning threads from explicit or repeatedly blocking gaps, and returns to an imported source when that return is conversationally useful.

The included experience is intentionally opinionated: a calm Arabic study room, not a flash-card dashboard. Fully vowelled tutor turns, contextual word glosses, majlis-oriented discussion moves, source provenance, learner-led detours, and separate listening/production mastery all live in the normal conversation flow.

## Run locally

Requirements: Node.js 20+ and a modern browser with microphone support.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without an API key the app remains usable in demo mode with browser speech recognition, text input, and local speech synthesis. For native realtime audio, set `OPENAI_API_KEY` in `.env.local`.

```dotenv
OPENAI_API_KEY=...
OPENAI_REALTIME_MODEL=gpt-realtime-2.1
OPENAI_REFLECTIVE_MODEL=gpt-5.6-terra
OPENAI_REALTIME_VOICE=cedar
OPENAI_TTS_VOICE=cedar
```

The server creates a short-lived Realtime client secret; the long-lived API key is never sent to the browser.

## What is implemented

- Push-to-talk WebRTC voice: the microphone stays closed against background noise, opens only while held, and still permits intentional barge-in.
- A fast learner-led loop that detects explicit requests, failed attempts, lexical gaps, construction attempts, interest, overload, and possible boredom.
- A reflective turn loop that can add tashkīl/alignment, detect subtler signals, estimate engagement over a rolling window, and update learning evidence.
- Temporary learning threads that can be followed now, woven into the topic, bookmarked, pinned, dismissed, or bridged back to the active text.
- Separate mastery for reading recognition, listening comprehension, recall, cued production, spontaneous production, and delayed transfer.
- Confidence-aware evidence weighting, retrieval latency, automaticity, retention half-life, spaced review, and mastered-item regression.
- Source import from pasted Arabic, text/Markdown files, PDFs, and—when an API key is configured—page images.
- Direct per-conversation source attachment: upload into the current conversation or attach/detach any chapter already in the source library.
- Fully vowelled conversation display with tap-for-meaning, root, and pronunciation affordances.
- Contextual English lookup for any tapped Arabic word, with classical/literary meanings preferred.
- Vocabulary and progress views that distinguish passive knowledge from independent, durable speaking ability.
- Local SQLite persistence; transcripts and timing evidence are stored, but raw audio is not.

## Architecture

```text
Browser microphone
  └─ WebRTC → Realtime fast loop
       ├─ speaks and yields immediately on interruption
       ├─ receives compact learner/source/thread context
       └─ logs stabilized turns
             └─ reflective turn analysis
                  ├─ interaction signals + engagement estimate
                  ├─ orchestration decision
                  ├─ competency evidence + spaced review
                  └─ next fast-loop context
```

Next.js route handlers own credentials and persistence. Drizzle table definitions live in `lib/db/schema.ts`; the zero-setup local adapter and seed data live in `lib/db/index.ts`. The key adaptive engines are in `lib/orchestrator.ts`, `lib/learner-model.ts`, and `lib/reflective.ts`. Tunable flow bands, engagement thresholds, mastery gates, thread weights, and voice timing are centralized in `lib/tutor-policy.ts` so the pedagogy can evolve without rewriting those engines or the interface.

Primary API routes:

- `POST /api/realtime/session`
- `POST /api/turns/finalize`
- `POST /api/signals`
- `GET|POST /api/threads` and thread pin/dismiss actions
- `POST /api/sources/import`
- `GET /api/activities/next`
- `GET /api/progress`
- `GET /api/vocabulary`
- `POST /api/preferences`

## Source and religious-text safety

Imported text is preserved as the learner's source anchor. The tutor prompt separates verified quotation, source paraphrase, attributed background, and illustrative language practice. It is instructed not to reconstruct Qurʾānic text from memory and not to offer fatwa or theological adjudication. `lib/source-safety.ts` exposes exact normalized-corpus validation for verified Qurʾānic quotations; production use should load an attributed Tanzil Uthmani corpus before marking such a quotation verified.

Lane's public-domain lexicon is the intended classical-meaning source. The data model follows Hans Wehr's useful root-oriented navigation, but Hans Wehr entries are not bundled or copied.

## Validation

```bash
npm run lint
npm test
npm run build
```

The tests cover learner-led overrides, greeting role-play, bookmarks, interest persistence, overload/boredom adaptation, confidence gates, delayed mastery, ASR uncertainty, Qurʾānic exactness, and learner speaking-share targets.

## Privacy

- The SQLite file defaults to `.data/fusha.db` and is gitignored.
- Raw audio is never written to the application database.
- Only transcripts, learner evidence, timing features, source text, and short-lived aggregate engagement indicators are stored.
- Engagement estimates are operational and reversible; the user-facing profile describes useful preferences rather than assigning emotional labels.
