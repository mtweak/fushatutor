import "server-only";

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import {
  seedCompetencies,
  seedPreferences,
  seedSources,
  seedThreads,
  seedTurns,
  seedVocabulary,
} from "@/lib/seed";
import { classifyVocabularyStatus, recommendAdaptiveFocus, updateMastery } from "@/lib/learner-model";
import type {
  BootstrapData,
  CompetencyEdge,
  CompetencyNode,
  ConversationTurn,
  ConversationThread,
  EngagementState,
  InteractionSignal,
  LearnerState,
  LearningThread,
  LearningThreadStatus,
  Preferences,
  ProgressSummary,
  SourceDocument,
  SourcePassage,
  TurnAnalysis,
  TurnMetrics,
  VocabularyItem,
} from "@/lib/types";
import { DEFAULT_CONVERSATION, DEFAULT_CONVERSATION_ID } from "@/lib/conversation-context";

const dbPath = process.env.FUSHA_DB_PATH || path.join(process.cwd(), ".data", "fusha.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const globalDb = globalThis as unknown as { fushaSqlite?: Database.Database };
const sqlite = globalDb.fushaSqlite ?? new Database(dbPath);
if (process.env.NODE_ENV !== "production") globalDb.fushaSqlite = sqlite;

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
export const db = drizzle(sqlite);

initialize();

function initialize() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS conversation_threads (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, topic_seed TEXT, context_summary TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_opened_at TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS vocabulary (
      id TEXT PRIMARY KEY, lemma TEXT NOT NULL, vocalized TEXT NOT NULL, root TEXT NOT NULL,
      sense TEXT NOT NULL, english_gloss TEXT NOT NULL, technical_gloss TEXT, register TEXT NOT NULL,
      status TEXT NOT NULL, comprehension REAL NOT NULL, production REAL NOT NULL,
      automaticity REAL NOT NULL, uncertainty REAL NOT NULL, retention_half_life_days REAL NOT NULL,
      context_count INTEGER NOT NULL, successful_delayed_use INTEGER NOT NULL, next_review TEXT,
      source_relevance REAL NOT NULL, discussion_utility REAL NOT NULL, collocations TEXT NOT NULL,
      examples TEXT NOT NULL, source_label TEXT
    );
    CREATE TABLE IF NOT EXISTS competency_states (
      id TEXT PRIMARY KEY, domain TEXT NOT NULL, label TEXT NOT NULL, arabic_label TEXT NOT NULL,
      mode TEXT NOT NULL, mastery_probability REAL NOT NULL, uncertainty REAL NOT NULL,
      automaticity REAL NOT NULL, retention_half_life_days REAL NOT NULL, context_count INTEGER NOT NULL,
      median_retrieval_latency_ms INTEGER, last_independent_use TEXT, next_review TEXT
    );
    CREATE TABLE IF NOT EXISTS competency_nodes (
      id TEXT PRIMARY KEY, domain TEXT NOT NULL, label TEXT NOT NULL, arabic_label TEXT NOT NULL,
      description TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS competency_edges (
      id TEXT PRIMARY KEY, from_node_id TEXT NOT NULL REFERENCES competency_nodes(id),
      to_node_id TEXT NOT NULL REFERENCES competency_nodes(id), relation TEXT NOT NULL, weight REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS learner_states (
      id TEXT PRIMARY KEY, competency_id TEXT NOT NULL REFERENCES competency_nodes(id), mode TEXT NOT NULL,
      mastery_probability REAL NOT NULL, uncertainty REAL NOT NULL, automaticity REAL NOT NULL,
      retention_half_life_days REAL NOT NULL, context_count INTEGER NOT NULL,
      median_retrieval_latency_ms INTEGER, last_independent_use TEXT, next_review TEXT
    );
    CREATE TABLE IF NOT EXISTS lexical_senses (
      id TEXT PRIMARY KEY, lemma TEXT NOT NULL, vocalized TEXT NOT NULL, root TEXT NOT NULL,
      classical_meaning TEXT NOT NULL, contextual_gloss TEXT NOT NULL, register TEXT NOT NULL,
      source_label TEXT
    );
    CREATE TABLE IF NOT EXISTS formulaic_sequences (
      id TEXT PRIMARY KEY, arabic TEXT NOT NULL, english_function TEXT NOT NULL,
      discourse_move TEXT NOT NULL, lexical_sense_id TEXT REFERENCES lexical_senses(id)
    );
    CREATE TABLE IF NOT EXISTS interaction_signals (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL DEFAULT '${DEFAULT_CONVERSATION_ID}',
      turn_id TEXT NOT NULL, type TEXT NOT NULL, target_text TEXT,
      intended_meaning TEXT, confidence REAL NOT NULL, explicitness REAL NOT NULL,
      persistence REAL NOT NULL, source_relevance REAL NOT NULL, detected_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS learning_threads (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL DEFAULT '${DEFAULT_CONVERSATION_ID}',
      trigger_signal_id TEXT NOT NULL, kind TEXT NOT NULL, learner_goal TEXT NOT NULL,
      target_arabic TEXT, related_competencies TEXT NOT NULL, related_passages TEXT NOT NULL,
      priority REAL NOT NULL, status TEXT NOT NULL, last_learner_interest_at TEXT NOT NULL,
      successful_uses INTEGER NOT NULL, source_bridge TEXT
    );
    CREATE TABLE IF NOT EXISTS engagement_snapshots (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL DEFAULT '${DEFAULT_CONVERSATION_ID}',
      engagement_probability REAL NOT NULL, boredom_probability REAL NOT NULL,
      overload_probability REAL NOT NULL, fatigue_probability REAL NOT NULL, challenge_level REAL NOT NULL,
      confidence REAL NOT NULL, supporting_signals TEXT NOT NULL, window_start_turn_id TEXT NOT NULL,
      window_end_turn_id TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversation_turns (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL DEFAULT '${DEFAULT_CONVERSATION_ID}',
      role TEXT NOT NULL, arabic TEXT NOT NULL, english TEXT,
      glosses TEXT NOT NULL, created_at TEXT NOT NULL, provisional INTEGER NOT NULL DEFAULT 0,
      source_status TEXT
    );
    CREATE TABLE IF NOT EXISTS source_documents (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT, genre TEXT NOT NULL,
      edition TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS source_passages (
      id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
      page INTEGER, sequence INTEGER NOT NULL, arabic TEXT NOT NULL, citation_label TEXT NOT NULL,
      is_direct_quote INTEGER NOT NULL DEFAULT 0, concepts TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS source_claims (
      id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
      passage_id TEXT REFERENCES source_passages(id) ON DELETE CASCADE, kind TEXT NOT NULL,
      text TEXT NOT NULL, attribution TEXT, verification_status TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversation_thread_sources (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
      document_id TEXT NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      UNIQUE(conversation_id, document_id)
    );
    CREATE TABLE IF NOT EXISTS topic_affinities (
      id TEXT PRIMARY KEY, topic TEXT NOT NULL UNIQUE, interest_score REAL NOT NULL,
      evidence_count INTEGER NOT NULL, last_observed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS evidence_events (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL DEFAULT '${DEFAULT_CONVERSATION_ID}',
      turn_id TEXT NOT NULL, target_id TEXT NOT NULL, target_kind TEXT NOT NULL,
      mode TEXT NOT NULL, success INTEGER NOT NULL, independence_weight REAL NOT NULL,
      confidence REAL NOT NULL, retrieval_latency_ms INTEGER, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS summary_attempts (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL DEFAULT '${DEFAULT_CONVERSATION_ID}',
      turn_id TEXT NOT NULL, passage_id TEXT, transcript TEXT NOT NULL,
      idea_completion REAL NOT NULL, source_fidelity_confidence REAL NOT NULL,
      support_level TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS turn_metrics (
      turn_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL DEFAULT '${DEFAULT_CONVERSATION_ID}',
      role TEXT NOT NULL, response_onset_ms INTEGER,
      speech_duration_ms INTEGER, pause_ratio REAL, mid_clause_pauses INTEGER,
      repair_count INTEGER, interrupted_tutor INTEGER, asr_confidence REAL,
      source_mode TEXT NOT NULL DEFAULT 'unknown', created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS session_decisions (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL DEFAULT '${DEFAULT_CONVERSATION_ID}',
      turn_id TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL,
      target_signal_id TEXT, difficulty_axis TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS preferences (
      id TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
    );
  `);
  ensureColumn("interaction_signals", "conversation_id", `TEXT NOT NULL DEFAULT '${DEFAULT_CONVERSATION_ID}'`);
  ensureColumn("learning_threads", "conversation_id", `TEXT NOT NULL DEFAULT '${DEFAULT_CONVERSATION_ID}'`);
  ensureColumn("engagement_snapshots", "conversation_id", `TEXT NOT NULL DEFAULT '${DEFAULT_CONVERSATION_ID}'`);
  ensureColumn("conversation_turns", "conversation_id", `TEXT NOT NULL DEFAULT '${DEFAULT_CONVERSATION_ID}'`);
  ensureColumn("evidence_events", "conversation_id", `TEXT NOT NULL DEFAULT '${DEFAULT_CONVERSATION_ID}'`);
  ensureColumn("summary_attempts", "conversation_id", `TEXT NOT NULL DEFAULT '${DEFAULT_CONVERSATION_ID}'`);
  ensureColumn("turn_metrics", "conversation_id", `TEXT NOT NULL DEFAULT '${DEFAULT_CONVERSATION_ID}'`);
  ensureColumn("session_decisions", "conversation_id", `TEXT NOT NULL DEFAULT '${DEFAULT_CONVERSATION_ID}'`);
  ensureColumn("turn_metrics", "source_mode", "TEXT NOT NULL DEFAULT 'unknown'");
  ensureColumn("source_documents", "source_type", "TEXT NOT NULL DEFAULT 'text'");
  ensureColumn("source_documents", "collection_id", "TEXT");
  ensureColumn("source_documents", "collection_title", "TEXT");
  ensureColumn("source_documents", "section_label", "TEXT");
  ensureColumn("source_documents", "page_start", "INTEGER");
  ensureColumn("source_documents", "page_end", "INTEGER");
  ensureColumn("source_documents", "file_name", "TEXT");
  ensureColumn("source_documents", "file_hash", "TEXT");
  ensureColumn("source_documents", "prompt_page_count", "INTEGER NOT NULL DEFAULT 0");

  ensureDefaultConversation();

  if ((sqlite.prepare("SELECT COUNT(*) AS count FROM vocabulary").get() as { count: number }).count === 0) seed();
  seedExtendedModel();
}

function ensureDefaultConversation() {
  const now = new Date().toISOString();
  sqlite.prepare(`
    INSERT OR IGNORE INTO conversation_threads (
      id, title, topic_seed, context_summary, created_at, updated_at, last_opened_at, archived
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    DEFAULT_CONVERSATION.id,
    DEFAULT_CONVERSATION.title,
    DEFAULT_CONVERSATION.topicSeed,
    DEFAULT_CONVERSATION.contextSummary,
    now,
    now,
    now,
  );
}

function seed() {
  const insertVocabulary = sqlite.prepare(`
    INSERT INTO vocabulary VALUES (
      @id, @lemma, @vocalized, @root, @sense, @englishGloss, @technicalGloss, @register, @status,
      @comprehension, @production, @automaticity, @uncertainty, @retentionHalfLifeDays, @contextCount,
      @successfulDelayedUse, @nextReview, @sourceRelevance, @discussionUtility, @collocations, @examples, @sourceLabel
    )
  `);
  const insertCompetency = sqlite.prepare(`
    INSERT INTO competency_states VALUES (
      @competencyId, @domain, @label, @arabicLabel, @mode, @masteryProbability, @uncertainty,
      @automaticity, @retentionHalfLifeDays, @contextCount, @medianRetrievalLatencyMs,
      @lastIndependentUse, @nextReview
    )
  `);
  const insertThread = sqlite.prepare(`
    INSERT INTO learning_threads (
      id, conversation_id, trigger_signal_id, kind, learner_goal, target_arabic, related_competencies,
      related_passages, priority, status, last_learner_interest_at, successful_uses, source_bridge
    ) VALUES (
      @id, @conversationId, @triggerSignalId, @kind, @learnerGoal, @targetArabic, @relatedCompetencies,
      @relatedPassages, @priority, @status, @lastLearnerInterestAt, @successfulUses, @sourceBridge
    )
  `);
  const insertTurn = sqlite.prepare(`
    INSERT INTO conversation_turns (
      id, conversation_id, role, arabic, english, glosses, created_at, provisional, source_status
    ) VALUES (@id, @conversationId, @role, @arabic, @english, @glosses, @createdAt, @provisional, @sourceStatus)
  `);
  const insertSource = sqlite.prepare(`
    INSERT INTO source_documents (id, title, author, genre, edition, created_at)
    VALUES (@id, @title, @author, @genre, @edition, @createdAt)
  `);
  const insertPassage = sqlite.prepare(`
    INSERT INTO source_passages VALUES (@id, @documentId, @page, @sequence, @arabic, @citationLabel, @isDirectQuote, @concepts)
  `);

  sqlite.transaction(() => {
    seedVocabulary.forEach((item) =>
      insertVocabulary.run({
        ...item,
        technicalGloss: item.technicalGloss ?? null,
        nextReview: item.nextReview ?? null,
        sourceLabel: item.sourceLabel ?? null,
        successfulDelayedUse: Number(item.successfulDelayedUse),
        collocations: JSON.stringify(item.collocations),
        examples: JSON.stringify(item.examples),
      }),
    );
    seedCompetencies.forEach((item) =>
      insertCompetency.run({
        ...item,
        medianRetrievalLatencyMs: item.medianRetrievalLatencyMs ?? null,
        lastIndependentUse: item.lastIndependentUse ?? null,
        nextReview: item.nextReview ?? null,
      }),
    );
    seedThreads.forEach((item) =>
      insertThread.run({
        ...item,
        targetArabic: item.targetArabic ?? null,
        sourceBridge: item.sourceBridge ?? null,
        relatedCompetencies: JSON.stringify(item.relatedCompetencies),
        relatedPassages: JSON.stringify(item.relatedPassages),
      }),
    );
    seedTurns.forEach((turn) =>
      insertTurn.run({
        ...turn,
        english: turn.english ?? null,
        glosses: JSON.stringify(turn.glosses),
        provisional: Number(Boolean(turn.provisional)),
        sourceStatus: turn.sourceStatus ?? null,
      }),
    );
    seedSources.forEach((source) => {
      insertSource.run({ ...source, author: source.author ?? null, edition: source.edition ?? null });
      source.passages.forEach((passage) =>
        insertPassage.run({
          ...passage,
          page: passage.page ?? null,
          isDirectQuote: Number(passage.isDirectQuote),
          concepts: JSON.stringify(passage.concepts),
        }),
      );
    });
    sqlite
      .prepare("INSERT INTO preferences VALUES (?, ?, ?)")
      .run("learner", JSON.stringify(seedPreferences), new Date().toISOString());
  })();
}

function seedExtendedModel() {
  const competencyDescriptions: Record<string, string> = {
    "c-listen": "Follow a spoken literary-Arabic idea without depending on a written sentence.",
    "c-vocab": "Retrieve precise classical and majlis vocabulary quickly enough to keep a turn moving.",
    "c-summary": "Restate a source faithfully, concisely, and in the learner's own Arabic.",
    "c-discourse": "Enter, sustain, clarify, qualify, and hand on a contribution in a gathering.",
    "c-grammar": "Recognize literary Arabic morphology and syntax.",
    "c-production": "Deploy known grammar automatically while speaking.",
    "c-fidelity": "Distinguish quotation, paraphrase, attribution, and illustration.",
  };
  const edges: CompetencyEdge[] = [
    { id: "edge-listen-summary", fromNodeId: "c-listen", toNodeId: "c-summary", relation: "prerequisite", weight: 0.82 },
    { id: "edge-vocab-summary", fromNodeId: "c-vocab", toNodeId: "c-summary", relation: "supports", weight: 0.8 },
    { id: "edge-grammar-production", fromNodeId: "c-grammar", toNodeId: "c-production", relation: "transfers_to", weight: 0.76 },
    { id: "edge-production-discourse", fromNodeId: "c-production", toNodeId: "c-discourse", relation: "supports", weight: 0.72 },
    { id: "edge-summary-discourse", fromNodeId: "c-summary", toNodeId: "c-discourse", relation: "supports", weight: 0.78 },
    { id: "edge-fidelity-summary", fromNodeId: "c-fidelity", toNodeId: "c-summary", relation: "supports", weight: 0.7 },
    { id: "edge-vocab-listen", fromNodeId: "c-vocab", toNodeId: "c-listen", relation: "supports", weight: 0.62 },
  ];

  sqlite.transaction(() => {
    const insertNode = sqlite.prepare("INSERT OR IGNORE INTO competency_nodes VALUES (?, ?, ?, ?, ?)");
    const insertState = sqlite.prepare("INSERT OR IGNORE INTO learner_states VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    seedCompetencies.forEach((state) => {
      insertNode.run(state.competencyId, state.domain, state.label, state.arabicLabel, competencyDescriptions[state.competencyId] || state.label);
      insertState.run(
        `state-${state.competencyId}`,
        state.competencyId,
        state.mode,
        state.masteryProbability,
        state.uncertainty,
        state.automaticity,
        state.retentionHalfLifeDays,
        state.contextCount,
        state.medianRetrievalLatencyMs ?? null,
        state.lastIndependentUse ?? null,
        state.nextReview ?? null,
      );
    });
    const insertEdge = sqlite.prepare("INSERT OR IGNORE INTO competency_edges VALUES (?, ?, ?, ?, ?)");
    edges.forEach((edge) => insertEdge.run(edge.id, edge.fromNodeId, edge.toNodeId, edge.relation, edge.weight));

    const insertSense = sqlite.prepare("INSERT OR IGNORE INTO lexical_senses VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    const insertSequence = sqlite.prepare("INSERT OR IGNORE INTO formulaic_sequences VALUES (?, ?, ?, ?, ?)");
    seedVocabulary.forEach((item) => {
      const senseId = `sense-${item.id}`;
      insertSense.run(senseId, item.lemma, item.vocalized, item.root, item.sense, item.englishGloss, item.register, item.sourceLabel ?? null);
      if (item.register === "formulaic") {
        insertSequence.run(
          `sequence-${item.id}`,
          item.vocalized,
          item.englishGloss,
          item.id === "v-yabdu" ? "qualified interpretation" : "respectful concession",
          senseId,
        );
      }
    });

    const now = new Date().toISOString();
    const insertAffinity = sqlite.prepare("INSERT OR IGNORE INTO topic_affinities VALUES (?, ?, ?, ?, ?)");
    insertAffinity.run("topic-tazkiya", "tazkiya", 0.92, 3, now);
    insertAffinity.run("topic-tafsir", "tafsir", 0.84, 2, now);
    insertAffinity.run("topic-majlis", "majlis discussion", 0.96, 4, now);

    sqlite.prepare(`
      INSERT OR IGNORE INTO source_claims (id, document_id, passage_id, kind, text, attribution, verification_status)
      SELECT 'claim-' || p.id, p.document_id, p.id,
        CASE WHEN p.is_direct_quote = 1 THEN 'source_quote' ELSE 'illustrative_language' END,
        p.arabic, p.citation_label,
        CASE WHEN p.is_direct_quote = 1 THEN 'uploaded_source' ELSE 'explicitly_unverified' END
      FROM source_passages p
    `).run();
    sqlite.prepare(`
      INSERT OR IGNORE INTO conversation_thread_sources (id, conversation_id, document_id, position)
      SELECT 'membership-' || id, ?, id, 0 FROM source_documents WHERE id = 'source-manazil'
    `).run(DEFAULT_CONVERSATION_ID);
  })();
}

type Row = Record<string, unknown>;
const parseJson = <T>(value: unknown, fallback: T): T => {
  try {
    return typeof value === "string" ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
};

export function getVocabulary(): VocabularyItem[] {
  return (sqlite.prepare("SELECT * FROM vocabulary ORDER BY CASE status WHEN 'learning' THEN 0 WHEN 'to_acquire' THEN 1 ELSE 2 END, discussion_utility DESC").all() as Row[]).map(
    (row) => ({
      id: String(row.id),
      lemma: String(row.lemma),
      vocalized: String(row.vocalized),
      root: String(row.root),
      sense: String(row.sense),
      englishGloss: String(row.english_gloss),
      technicalGloss: row.technical_gloss ? String(row.technical_gloss) : undefined,
      register: row.register as VocabularyItem["register"],
      status: row.status as VocabularyItem["status"],
      comprehension: Number(row.comprehension),
      production: Number(row.production),
      automaticity: Number(row.automaticity),
      uncertainty: Number(row.uncertainty),
      retentionHalfLifeDays: Number(row.retention_half_life_days),
      contextCount: Number(row.context_count),
      successfulDelayedUse: Boolean(row.successful_delayed_use),
      nextReview: row.next_review ? String(row.next_review) : undefined,
      sourceRelevance: Number(row.source_relevance),
      discussionUtility: Number(row.discussion_utility),
      collocations: parseJson<string[]>(row.collocations, []),
      examples: parseJson<string[]>(row.examples, []),
      sourceLabel: row.source_label ? String(row.source_label) : undefined,
    }),
  );
}

export function getCompetencies(): LearnerState[] {
  return (sqlite.prepare(`
    SELECT s.*, n.domain, n.label, n.arabic_label
    FROM learner_states s JOIN competency_nodes n ON n.id = s.competency_id
    ORDER BY s.mastery_probability ASC
  `).all() as Row[]).map((row) => ({
    competencyId: String(row.competency_id),
    domain: row.domain as LearnerState["domain"],
    label: String(row.label),
    arabicLabel: String(row.arabic_label),
    mode: row.mode as LearnerState["mode"],
    masteryProbability: Number(row.mastery_probability),
    uncertainty: Number(row.uncertainty),
    automaticity: Number(row.automaticity),
    retentionHalfLifeDays: Number(row.retention_half_life_days),
    contextCount: Number(row.context_count),
    medianRetrievalLatencyMs: row.median_retrieval_latency_ms ? Number(row.median_retrieval_latency_ms) : undefined,
    lastIndependentUse: row.last_independent_use ? String(row.last_independent_use) : undefined,
    nextReview: row.next_review ? String(row.next_review) : undefined,
  }));
}

export function getCompetencyGraph(): { nodes: CompetencyNode[]; edges: CompetencyEdge[] } {
  const nodes = (sqlite.prepare("SELECT * FROM competency_nodes ORDER BY id").all() as Row[]).map((row) => ({
    id: String(row.id),
    domain: row.domain as CompetencyNode["domain"],
    label: String(row.label),
    arabicLabel: String(row.arabic_label),
    description: String(row.description),
  }));
  const edges = (sqlite.prepare("SELECT * FROM competency_edges ORDER BY id").all() as Row[]).map((row) => ({
    id: String(row.id),
    fromNodeId: String(row.from_node_id),
    toNodeId: String(row.to_node_id),
    relation: row.relation as CompetencyEdge["relation"],
    weight: Number(row.weight),
  }));
  return { nodes, edges };
}

export function getConversations(): ConversationThread[] {
  const rows = sqlite.prepare(`
    SELECT * FROM conversation_threads WHERE archived = 0
    ORDER BY last_opened_at DESC, updated_at DESC
  `).all() as Row[];
  const sourcesForConversation = sqlite.prepare(`
    SELECT d.id, d.title FROM conversation_thread_sources membership
    JOIN source_documents d ON d.id = membership.document_id
    WHERE membership.conversation_id = ? ORDER BY membership.position, d.created_at
  `);
  const countTurns = sqlite.prepare("SELECT COUNT(*) AS count FROM conversation_turns WHERE conversation_id = ?");
  return rows.map((row) => {
    const sources = sourcesForConversation.all(row.id) as Row[];
    const count = countTurns.get(row.id) as { count: number };
    return {
      id: String(row.id),
      title: String(row.title),
      topicSeed: row.topic_seed ? String(row.topic_seed) : undefined,
      contextSummary: row.context_summary ? String(row.context_summary) : undefined,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      lastOpenedAt: String(row.last_opened_at),
      archived: Boolean(row.archived),
      sourceIds: sources.map((source) => String(source.id)),
      sourceLabels: sources.map((source) => String(source.title)),
      turnCount: count.count,
    };
  });
}

export function getConversation(id: string): ConversationThread | undefined {
  return getConversations().find((conversation) => conversation.id === id);
}

export function createConversation(input: {
  title: string;
  topicSeed?: string;
  contextSummary?: string;
  sourceIds?: string[];
}): ConversationThread {
  const now = new Date().toISOString();
  const id = `conversation-${crypto.randomUUID()}`;
  sqlite.transaction(() => {
    sqlite.prepare(`
      INSERT INTO conversation_threads (
        id, title, topic_seed, context_summary, created_at, updated_at, last_opened_at, archived
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      id,
      input.title.trim() || "مَجْلِسٌ جَدِيدٌ",
      input.topicSeed?.trim() || null,
      input.contextSummary?.trim() || null,
      now,
      now,
      now,
    );
    setConversationSources(id, input.sourceIds ?? []);
  })();
  return getConversation(id)!;
}

export function updateConversation(
  id: string,
  input: { title?: string; topicSeed?: string; contextSummary?: string; sourceIds?: string[]; archived?: boolean },
): ConversationThread | undefined {
  const current = getConversation(id);
  if (!current) return undefined;
  sqlite.transaction(() => {
    sqlite.prepare(`
      UPDATE conversation_threads SET title = ?, topic_seed = ?, context_summary = ?,
        archived = ?, updated_at = ? WHERE id = ?
    `).run(
      input.title?.trim() || current.title,
      input.topicSeed === undefined ? current.topicSeed ?? null : input.topicSeed.trim() || null,
      input.contextSummary === undefined ? current.contextSummary ?? null : input.contextSummary.trim() || null,
      input.archived === undefined ? Number(current.archived) : Number(input.archived),
      new Date().toISOString(),
      id,
    );
    if (input.sourceIds) setConversationSources(id, input.sourceIds);
  })();
  return input.archived ? undefined : getConversation(id);
}

export function openConversation(id: string): ConversationThread | undefined {
  const result = sqlite.prepare(`
    UPDATE conversation_threads SET last_opened_at = ? WHERE id = ? AND archived = 0
  `).run(new Date().toISOString(), id);
  return result.changes ? getConversation(id) : undefined;
}

function setConversationSources(conversationId: string, sourceIds: string[]) {
  sqlite.prepare("DELETE FROM conversation_thread_sources WHERE conversation_id = ?").run(conversationId);
  const insert = sqlite.prepare(`
    INSERT OR IGNORE INTO conversation_thread_sources (id, conversation_id, document_id, position)
    SELECT ?, ?, id, ? FROM source_documents WHERE id = ?
  `);
  [...new Set(sourceIds)].forEach((sourceId, position) => {
    insert.run(`membership-${crypto.randomUUID()}`, conversationId, position, sourceId);
  });
}

export function getThreads(conversationId?: string): LearningThread[] {
  const sql = `
    SELECT * FROM learning_threads ${conversationId ? "WHERE conversation_id = ?" : ""}
    ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'woven_in' THEN 1 WHEN 'bookmarked' THEN 2 ELSE 3 END,
      last_learner_interest_at DESC, priority DESC
  `;
  const rows = (conversationId ? sqlite.prepare(sql).all(conversationId) : sqlite.prepare(sql).all()) as Row[];
  return rows.map(
    (row) => ({
      id: String(row.id),
      conversationId: String(row.conversation_id),
      triggerSignalId: String(row.trigger_signal_id),
      kind: row.kind as LearningThread["kind"],
      learnerGoal: String(row.learner_goal),
      targetArabic: row.target_arabic ? String(row.target_arabic) : undefined,
      relatedCompetencies: parseJson<string[]>(row.related_competencies, []),
      relatedPassages: parseJson<string[]>(row.related_passages, []),
      priority: Number(row.priority),
      status: row.status as LearningThread["status"],
      lastLearnerInterestAt: String(row.last_learner_interest_at),
      successfulUses: Number(row.successful_uses),
      sourceBridge: row.source_bridge ? String(row.source_bridge) : undefined,
    }),
  );
}

export function getTurns(conversationId?: string): ConversationTurn[] {
  const rows = conversationId
    ? sqlite.prepare(`
        SELECT * FROM (
          SELECT * FROM conversation_turns WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 80
        ) ORDER BY created_at ASC
      `).all(conversationId)
    : sqlite.prepare("SELECT * FROM conversation_turns ORDER BY created_at ASC").all();
  return (rows as Row[]).map((row) => ({
    id: String(row.id),
    conversationId: String(row.conversation_id),
    role: row.role as ConversationTurn["role"],
    arabic: String(row.arabic),
    english: row.english ? String(row.english) : undefined,
    glosses: parseJson<ConversationTurn["glosses"]>(row.glosses, []),
    createdAt: String(row.created_at),
    provisional: Boolean(row.provisional),
    sourceStatus: row.source_status ? (row.source_status as ConversationTurn["sourceStatus"]) : undefined,
  }));
}

export function getSources(conversationId?: string): SourceDocument[] {
  const documents = (conversationId
    ? sqlite.prepare(`
        SELECT d.* FROM conversation_thread_sources membership
        JOIN source_documents d ON d.id = membership.document_id
        WHERE membership.conversation_id = ? ORDER BY membership.position, d.created_at DESC
      `).all(conversationId) as Row[]
    : sqlite.prepare("SELECT * FROM source_documents ORDER BY created_at DESC").all() as Row[]);
  if (!conversationId) {
    const newestByCollection = new Map<string, number>();
    documents.forEach((document) => {
      const group = String(document.collection_id || document.id);
      const created = Date.parse(String(document.created_at));
      newestByCollection.set(group, Math.max(newestByCollection.get(group) || 0, created));
    });
    documents.sort((left, right) => {
      const leftGroup = String(left.collection_id || left.id);
      const rightGroup = String(right.collection_id || right.id);
      const recency = (newestByCollection.get(rightGroup) || 0) - (newestByCollection.get(leftGroup) || 0);
      if (recency) return recency;
      if (leftGroup === rightGroup) return Number(left.page_start || 0) - Number(right.page_start || 0);
      return String(left.title).localeCompare(String(right.title));
    });
  }
  const passageStatement = sqlite.prepare("SELECT * FROM source_passages WHERE document_id = ? ORDER BY sequence ASC");
  return documents.map((document) => ({
    id: String(document.id),
    title: String(document.title),
    author: document.author ? String(document.author) : undefined,
    genre: String(document.genre),
    edition: document.edition ? String(document.edition) : undefined,
    createdAt: String(document.created_at),
    sourceType: (document.source_type ? String(document.source_type) : "text") as SourceDocument["sourceType"],
    collectionId: document.collection_id ? String(document.collection_id) : undefined,
    collectionTitle: document.collection_title ? String(document.collection_title) : undefined,
    sectionLabel: document.section_label ? String(document.section_label) : undefined,
    pageStart: document.page_start ? Number(document.page_start) : undefined,
    pageEnd: document.page_end ? Number(document.page_end) : undefined,
    fileName: document.file_name ? String(document.file_name) : undefined,
    fileHash: document.file_hash ? String(document.file_hash) : undefined,
    promptPageCount: Number(document.prompt_page_count || 0),
    passages: (passageStatement.all(document.id) as Row[]).map((passage) => ({
      id: String(passage.id),
      documentId: String(passage.document_id),
      page: passage.page ? Number(passage.page) : undefined,
      sequence: Number(passage.sequence),
      arabic: String(passage.arabic),
      citationLabel: String(passage.citation_label),
      isDirectQuote: Boolean(passage.is_direct_quote),
      concepts: parseJson<string[]>(passage.concepts, []),
    })),
  }));
}

export function getPreferences(): Preferences {
  const row = sqlite.prepare("SELECT value FROM preferences WHERE id = 'learner'").get() as { value?: string } | undefined;
  return parseJson<Preferences>(row?.value, seedPreferences);
}

export function updatePreferences(partial: Partial<Preferences>): Preferences {
  const preferences = { ...getPreferences(), ...partial };
  sqlite
    .prepare("INSERT INTO preferences VALUES ('learner', ?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .run(JSON.stringify(preferences), new Date().toISOString());
  return preferences;
}

export function getProgress(): ProgressSummary {
  const vocabulary = getVocabulary();
  const competencies = getCompetencies();
  const metrics = sqlite.prepare("SELECT * FROM turn_metrics WHERE source_mode = 'realtime' ORDER BY created_at ASC").all() as Row[];
  const learnerDurations = metrics.filter((row) => row.role === "learner" && row.speech_duration_ms).map((row) => Number(row.speech_duration_ms));
  const tutorDurations = metrics.filter((row) => row.role === "tutor" && row.speech_duration_ms).map((row) => Number(row.speech_duration_ms));
  const responseOnsets = metrics.filter((row) => row.role === "learner" && row.response_onset_ms).map((row) => Number(row.response_onset_ms));
  const learnerMs = learnerDurations.reduce((sum, value) => sum + value, 0);
  const tutorMs = tutorDurations.reduce((sum, value) => sum + value, 0);
  const dimensions = competencies.slice(0, 7).map((competency, index) => ({
    id: competency.competencyId,
    label: competency.label,
    arabicLabel: competency.arabicLabel,
    value: Math.round(competency.masteryProbability * 100),
    trend: [4, 7, 5, 9, 2, 6, 3][index] ?? 3,
  }));
  const majlisDimensions = competencies.filter((item) =>
    ["listening", "vocabulary", "summarization", "discourse_management", "source_fidelity"].includes(item.domain),
  );
  return {
    majlisReadiness: Math.round(
      (majlisDimensions.reduce((sum, item) => sum + item.masteryProbability, 0) / Math.max(1, majlisDimensions.length)) * 100,
    ),
    activeVocabulary: vocabulary.filter((item) => item.status === "learning").length,
    masteredVocabulary: vocabulary.filter((item) => item.status === "mastered").length,
    dueForReview: vocabulary.filter((item) => item.nextReview && new Date(item.nextReview) <= new Date()).length,
    learnerSpeechShare: learnerMs + tutorMs > 0 ? Math.round((learnerMs / (learnerMs + tutorMs)) * 100) : 63,
    medianResponseOnsetMs: median(responseOnsets),
    longestLearnerTurnMs: learnerDurations.length ? Math.max(...learnerDurations) : undefined,
    nextFocus: recommendAdaptiveFocus(competencies, latestEngagement()),
    dimensions,
  };
}

export function getBootstrapData(requestedConversationId?: string): BootstrapData {
  const conversations = getConversations();
  const activeConversation = conversations.find((item) => item.id === requestedConversationId) ?? conversations[0];
  const activeConversationId = activeConversation?.id ?? DEFAULT_CONVERSATION_ID;
  return {
    configured: Boolean(process.env.OPENAI_API_KEY),
    activeConversationId,
    conversations,
    turns: getTurns(activeConversationId),
    vocabulary: getVocabulary(),
    competencies: getCompetencies(),
    competencyGraph: getCompetencyGraph(),
    threads: getThreads(activeConversationId),
    sources: getSources(activeConversationId),
    sourceLibrary: getSources(),
    progress: getProgress(),
    preferences: getPreferences(),
  };
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : Math.round((ordered[middle - 1] + ordered[middle]) / 2);
}

export function addTurn(turn: ConversationTurn) {
  sqlite.transaction(() => {
    sqlite.prepare(`
      INSERT OR REPLACE INTO conversation_turns (
        id, conversation_id, role, arabic, english, glosses, created_at, provisional, source_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      turn.id,
      turn.conversationId,
      turn.role,
      turn.arabic,
      turn.english ?? null,
      JSON.stringify(turn.glosses),
      turn.createdAt,
      Number(Boolean(turn.provisional)),
      turn.sourceStatus ?? null,
    );
    sqlite.prepare("UPDATE conversation_threads SET updated_at = ? WHERE id = ?")
      .run(turn.createdAt, turn.conversationId);
  })();
}

export function persistTurnAnalysis(turn: ConversationTurn, analysis: TurnAnalysis) {
  addTurn(turn);
  const insertSignal = sqlite.prepare(`
    INSERT OR REPLACE INTO interaction_signals (
      id, conversation_id, turn_id, type, target_text, intended_meaning, confidence,
      explicitness, persistence, source_relevance, detected_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertEngagement = sqlite.prepare(`
    INSERT INTO engagement_snapshots (
      id, conversation_id, engagement_probability, boredom_probability, overload_probability,
      fatigue_probability, challenge_level, confidence, supporting_signals,
      window_start_turn_id, window_end_turn_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertDecision = sqlite.prepare(`
    INSERT INTO session_decisions (
      id, conversation_id, turn_id, action, reason, target_signal_id, difficulty_axis, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertEvidence = sqlite.prepare(`
    INSERT INTO evidence_events (
      id, conversation_id, turn_id, target_id, target_kind, mode, success,
      independence_weight, confidence, retrieval_latency_ms, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  sqlite.transaction(() => {
    analysis.signals.forEach((signal) => {
      insertSignal.run(
        signal.id,
        signal.conversationId,
        signal.turnId,
        signal.type,
        signal.targetText ?? null,
        signal.intendedMeaning ?? null,
        signal.confidence,
        signal.explicitness,
        signal.persistence,
        signal.sourceRelevance,
        signal.detectedAt,
      );
    });
    const engagement = analysis.engagement;
    insertEngagement.run(
      `eng-${crypto.randomUUID()}`,
      turn.conversationId,
      engagement.engagementProbability,
      engagement.boredomProbability,
      engagement.overloadProbability,
      engagement.fatigueProbability,
      engagement.challengeLevel,
      engagement.confidence,
      JSON.stringify(engagement.supportingSignals),
      engagement.windowStartTurnId,
      engagement.windowEndTurnId,
      new Date().toISOString(),
    );
    insertDecision.run(
      `decision-${crypto.randomUUID()}`,
      turn.conversationId,
      turn.id,
      analysis.decision.action,
      analysis.decision.reason,
      analysis.decision.targetSignalId ?? null,
      analysis.decision.difficultyAxis ?? null,
      new Date().toISOString(),
    );
    analysis.vocabularyEvidence.forEach((evidence) => {
      insertEvidence.run(
        `evidence-${crypto.randomUUID()}`,
        turn.conversationId,
        turn.id,
        evidence.vocabularyId,
        "lexical_sense",
        evidence.mode,
        Number(evidence.success),
        evidence.independenceWeight,
        evidence.confidence,
        evidence.retrievalLatencyMs ?? null,
        new Date().toISOString(),
      );
    });
    analysis.signals.filter((signal) => signal.type === "topic_interest" && signal.targetText).forEach((signal) => {
      const topic = signal.targetText!.slice(0, 120);
      sqlite.prepare(`
        INSERT INTO topic_affinities VALUES (?, ?, ?, 1, ?)
        ON CONFLICT(topic) DO UPDATE SET
          interest_score = MIN(1, topic_affinities.interest_score * .82 + excluded.interest_score * .18),
          evidence_count = topic_affinities.evidence_count + 1,
          last_observed_at = excluded.last_observed_at
      `).run(`topic-${crypto.randomUUID()}`, topic, signal.confidence, signal.detectedAt);
    });
    if (turn.role === "learner" && isSummaryAttempt(turn.arabic)) {
      const passage = sqlite.prepare(`
        SELECT p.id FROM conversation_thread_sources membership
        JOIN source_passages p ON p.document_id = membership.document_id
        WHERE membership.conversation_id = ? ORDER BY membership.position, p.sequence LIMIT 1
      `).get(turn.conversationId) as { id?: string } | undefined;
      sqlite.prepare(`
        INSERT INTO summary_attempts (
          id, conversation_id, turn_id, passage_id, transcript, idea_completion,
          source_fidelity_confidence, support_level, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `summary-${crypto.randomUUID()}`,
        turn.conversationId,
        turn.id,
        passage?.id ?? null,
        turn.arabic,
        Math.min(1, arabicWordCount(turn.arabic) / 30),
        0.5,
        "independent",
        new Date().toISOString(),
      );
    }
    if (analysis.decision.thread) saveThread(analysis.decision.thread);
    applyVocabularyEvidence(analysis);
  })();
}

export function saveTurnMetrics(
  turnId: string,
  conversationId: string,
  role: ConversationTurn["role"],
  metrics: TurnMetrics = {},
  sourceMode: "realtime" | "demo" | "text" | "system" = "system",
) {
  sqlite.prepare(`
    INSERT INTO turn_metrics (
      turn_id, conversation_id, role, response_onset_ms, speech_duration_ms, pause_ratio, mid_clause_pauses,
      repair_count, interrupted_tutor, asr_confidence, source_mode, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(turn_id) DO UPDATE SET
      conversation_id = excluded.conversation_id, role = excluded.role, response_onset_ms = excluded.response_onset_ms,
      speech_duration_ms = excluded.speech_duration_ms, pause_ratio = excluded.pause_ratio,
      mid_clause_pauses = excluded.mid_clause_pauses, repair_count = excluded.repair_count,
      interrupted_tutor = excluded.interrupted_tutor, asr_confidence = excluded.asr_confidence,
      source_mode = excluded.source_mode
  `).run(
    turnId,
    conversationId,
    role,
    metrics.responseOnsetMs ?? null,
    metrics.speechDurationMs ?? null,
    metrics.pauseRatio ?? null,
    metrics.midClausePauses ?? null,
    metrics.repairCount ?? null,
    metrics.interruptedTutor === undefined ? null : Number(metrics.interruptedTutor),
    metrics.asrConfidence ?? null,
    sourceMode,
    new Date().toISOString(),
  );
}

export function saveSignal(signal: InteractionSignal) {
  sqlite
    .prepare(`
      INSERT OR REPLACE INTO interaction_signals (
        id, conversation_id, turn_id, type, target_text, intended_meaning, confidence,
        explicitness, persistence, source_relevance, detected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      signal.id,
      signal.conversationId,
      signal.turnId,
      signal.type,
      signal.targetText ?? null,
      signal.intendedMeaning ?? null,
      signal.confidence,
      signal.explicitness,
      signal.persistence,
      signal.sourceRelevance,
      signal.detectedAt,
    );
}

export function saveThread(thread: LearningThread) {
  sqlite
    .prepare(`
      INSERT INTO learning_threads (
        id, conversation_id, trigger_signal_id, kind, learner_goal, target_arabic,
        related_competencies, related_passages, priority, status,
        last_learner_interest_at, successful_uses, source_bridge
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET learner_goal = excluded.learner_goal, target_arabic = excluded.target_arabic,
      priority = excluded.priority, status = excluded.status, last_learner_interest_at = excluded.last_learner_interest_at,
      successful_uses = excluded.successful_uses, source_bridge = excluded.source_bridge
    `)
    .run(
      thread.id,
      thread.conversationId,
      thread.triggerSignalId,
      thread.kind,
      thread.learnerGoal,
      thread.targetArabic ?? null,
      JSON.stringify(thread.relatedCompetencies),
      JSON.stringify(thread.relatedPassages),
      thread.priority,
      thread.status,
      thread.lastLearnerInterestAt,
      thread.successfulUses,
      thread.sourceBridge ?? null,
    );
}

export function setThreadStatus(id: string, status: LearningThreadStatus): LearningThread | undefined {
  sqlite.prepare("UPDATE learning_threads SET status = ?, last_learner_interest_at = ? WHERE id = ?").run(status, new Date().toISOString(), id);
  return getThreads().find((thread) => thread.id === id);
}

export function addSource(
  input: {
    title: string;
    author?: string;
    genre?: string;
    edition?: string;
    text?: string;
    pages?: Array<{ page: number; text: string }>;
    sourceType?: SourceDocument["sourceType"];
    collectionId?: string;
    collectionTitle?: string;
    sectionLabel?: string;
    pageStart?: number;
    pageEnd?: number;
    fileName?: string;
    fileHash?: string;
    promptPageCount?: number;
  },
  conversationId?: string,
): SourceDocument {
  const id = `source-${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  const passageInputs = input.pages?.length
    ? input.pages.map((page) => ({ arabic: page.text.trim(), page: page.page })).filter((page) => page.arabic)
    : (input.text || "")
        .split(/\n\s*\n/)
        .map((paragraph) => ({ arabic: paragraph.trim(), page: undefined }))
        .filter((paragraph) => paragraph.arabic)
        .slice(0, 120);
  const passages: SourcePassage[] = passageInputs.map(({ arabic, page }, index) => ({
    id: `passage-${crypto.randomUUID()}`,
    documentId: id,
    page,
    sequence: index + 1,
    arabic,
    citationLabel: `${input.collectionTitle ? `${input.collectionTitle}, ` : ""}${input.sectionLabel || input.title}${page ? `, PDF p. ${page}` : `, passage ${index + 1}`}`,
    isDirectQuote: true,
    concepts: extractConcepts(arabic),
  }));
  const source: SourceDocument = {
    id,
    title: input.title,
    author: input.author,
    genre: input.genre || "study text",
    edition: input.edition,
    createdAt,
    sourceType: input.sourceType || "text",
    collectionId: input.collectionId,
    collectionTitle: input.collectionTitle,
    sectionLabel: input.sectionLabel,
    pageStart: input.pageStart,
    pageEnd: input.pageEnd,
    fileName: input.fileName,
    fileHash: input.fileHash,
    promptPageCount: input.promptPageCount || 0,
    passages,
  };
  sqlite.transaction(() => {
    sqlite
      .prepare(`
        INSERT INTO source_documents (
          id, title, author, genre, edition, created_at, source_type, collection_id,
          collection_title, section_label, page_start, page_end, file_name, file_hash, prompt_page_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        source.id,
        source.title,
        source.author ?? null,
        source.genre,
        source.edition ?? null,
        source.createdAt,
        source.sourceType,
        source.collectionId ?? null,
        source.collectionTitle ?? null,
        source.sectionLabel ?? null,
        source.pageStart ?? null,
        source.pageEnd ?? null,
        source.fileName ?? null,
        source.fileHash ?? null,
        source.promptPageCount ?? 0,
      );
    const statement = sqlite.prepare("INSERT INTO source_passages VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    const claimStatement = sqlite.prepare("INSERT INTO source_claims VALUES (?, ?, ?, ?, ?, ?, ?)");
    source.passages.forEach((passage) => {
      statement.run(
        passage.id,
        passage.documentId,
        passage.page ?? null,
        passage.sequence,
        passage.arabic,
        passage.citationLabel,
        Number(passage.isDirectQuote),
        JSON.stringify(passage.concepts),
      );
      claimStatement.run(
        `claim-${passage.id}`,
        source.id,
        passage.id,
        "source_quote",
        passage.arabic,
        passage.citationLabel,
        "uploaded_source",
      );
    });
    if (conversationId && getConversation(conversationId)) {
      const position = (sqlite.prepare(`
        SELECT COUNT(*) AS count FROM conversation_thread_sources WHERE conversation_id = ?
      `).get(conversationId) as { count: number }).count;
      sqlite.prepare(`
        INSERT OR IGNORE INTO conversation_thread_sources (id, conversation_id, document_id, position)
        VALUES (?, ?, ?, ?)
      `).run(`membership-${crypto.randomUUID()}`, conversationId, source.id, position);
      sqlite.prepare("UPDATE conversation_threads SET updated_at = ? WHERE id = ?").run(createdAt, conversationId);
    }
  })();
  return source;
}

export function getSourcesByFileHash(fileHash: string): SourceDocument[] {
  return getSources().filter((source) => source.fileHash === fileHash);
}

export function attachSourceToConversation(sourceId: string, conversationId: string): void {
  if (!getConversation(conversationId)) return;
  const now = new Date().toISOString();
  const position = (sqlite.prepare(`
    SELECT COUNT(*) AS count FROM conversation_thread_sources WHERE conversation_id = ?
  `).get(conversationId) as { count: number }).count;
  sqlite.prepare(`
    INSERT OR IGNORE INTO conversation_thread_sources (id, conversation_id, document_id, position)
    VALUES (?, ?, ?, ?)
  `).run(`membership-${crypto.randomUUID()}`, conversationId, sourceId, position);
  sqlite.prepare("UPDATE conversation_threads SET updated_at = ? WHERE id = ?").run(now, conversationId);
}

export function detachSourceFromConversation(sourceId: string, conversationId: string): void {
  const result = sqlite.prepare(`
    DELETE FROM conversation_thread_sources WHERE conversation_id = ? AND document_id = ?
  `).run(conversationId, sourceId);
  if (result.changes) {
    sqlite.prepare("UPDATE conversation_threads SET updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), conversationId);
  }
}

export function latestEngagement(conversationId?: string): EngagementState | undefined {
  const row = (conversationId
    ? sqlite.prepare("SELECT * FROM engagement_snapshots WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1").get(conversationId)
    : sqlite.prepare("SELECT * FROM engagement_snapshots ORDER BY created_at DESC LIMIT 1").get()) as Row | undefined;
  if (!row) return undefined;
  return {
    engagementProbability: Number(row.engagement_probability),
    boredomProbability: Number(row.boredom_probability),
    overloadProbability: Number(row.overload_probability),
    fatigueProbability: Number(row.fatigue_probability),
    challengeLevel: Number(row.challenge_level),
    confidence: Number(row.confidence),
    supportingSignals: parseJson<string[]>(row.supporting_signals, []),
    windowStartTurnId: String(row.window_start_turn_id),
    windowEndTurnId: String(row.window_end_turn_id),
  };
}

function applyVocabularyEvidence(analysis: TurnAnalysis) {
  const statement = sqlite.prepare("SELECT * FROM vocabulary WHERE id = ?");
  const update = sqlite.prepare(`
    UPDATE vocabulary SET production = ?, automaticity = ?, uncertainty = ?, context_count = ?,
      retention_half_life_days = ?, status = ?, next_review = ? WHERE id = ?
  `);
  const updateLearnerState = sqlite.prepare(`
    UPDATE learner_states SET mastery_probability = ?, uncertainty = ?, automaticity = ?,
      retention_half_life_days = ?, context_count = ?, median_retrieval_latency_ms = ?,
      last_independent_use = ?, next_review = ? WHERE competency_id = ?
  `);
  analysis.vocabularyEvidence.forEach((evidence) => {
    if (evidence.confidence < 0.65 || !evidence.success) return;
    const row = statement.get(evidence.vocabularyId) as Row | undefined;
    if (!row) return;
    const item = getVocabulary().find((candidate) => candidate.id === evidence.vocabularyId);
    if (!item) return;
    item.production = Math.min(0.98, item.production + (1 - item.production) * 0.12 * evidence.independenceWeight);
    item.automaticity = Math.min(0.98, item.automaticity + (1 - item.automaticity) * 0.08 * evidence.independenceWeight);
    item.uncertainty = Math.max(0.04, item.uncertainty * 0.94);
    item.contextCount += 1;
    item.retentionHalfLifeDays *= 1 + 0.5 * evidence.independenceWeight;
    item.status = classifyVocabularyStatus(item);
    item.nextReview = new Date(Date.now() + Math.max(1, item.retentionHalfLifeDays * 0.23) * 86_400_000).toISOString();
    update.run(
      item.production,
      item.automaticity,
      item.uncertainty,
      item.contextCount,
      item.retentionHalfLifeDays,
      item.status,
      item.nextReview,
      item.id,
    );

    const vocabularyState = getCompetencies().find((state) => state.competencyId === "c-vocab");
    if (vocabularyState) {
      const updated = updateMastery(vocabularyState, {
        success: evidence.success,
        weight: evidence.independenceWeight,
        confidence: evidence.confidence,
        retrievalLatencyMs: evidence.retrievalLatencyMs,
      });
      const contextCount = updated.contextCount + (evidence.success ? 1 : 0);
      const lastIndependentUse = evidence.success && evidence.independenceWeight >= 0.75
        ? new Date().toISOString()
        : updated.lastIndependentUse;
      const nextReview = new Date(Date.now() + Math.max(1, updated.retentionHalfLifeDays * 0.23) * 86_400_000).toISOString();
      updateLearnerState.run(
        updated.masteryProbability,
        updated.uncertainty,
        updated.automaticity,
        updated.retentionHalfLifeDays,
        contextCount,
        updated.medianRetrievalLatencyMs ?? null,
        lastIndependentUse ?? null,
        nextReview,
        updated.competencyId,
      );
    }
  });
}

function extractConcepts(text: string): string[] {
  const words = text.match(/[\u0600-\u06FF]{4,}/g) ?? [];
  return [...new Set(words.map((word) => word.replace(/[ًٌٍَُِّْـ]/g, "")))].slice(0, 8);
}

function arabicWordCount(text: string): number {
  return text.trim().split(/\s+/).filter((word) => /[\u0600-\u06FF]/.test(word)).length;
}

function isSummaryAttempt(text: string): boolean {
  return /أُلَخِّصُ|خُلَاصَةُ|يُمْكِنُ تَلْخِيصُ|الْمَقْصُودُ|يَتَلَخَّصُ/.test(text) || arabicWordCount(text) >= 28;
}

function ensureColumn(table: string, column: string, definition: string) {
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
