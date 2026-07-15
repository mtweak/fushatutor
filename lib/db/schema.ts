import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const vocabulary = sqliteTable("vocabulary", {
  id: text("id").primaryKey(),
  lemma: text("lemma").notNull(),
  vocalized: text("vocalized").notNull(),
  root: text("root").notNull(),
  sense: text("sense").notNull(),
  englishGloss: text("english_gloss").notNull(),
  technicalGloss: text("technical_gloss"),
  register: text("register").notNull(),
  status: text("status").notNull(),
  comprehension: real("comprehension").notNull(),
  production: real("production").notNull(),
  automaticity: real("automaticity").notNull(),
  uncertainty: real("uncertainty").notNull(),
  retentionHalfLifeDays: real("retention_half_life_days").notNull(),
  contextCount: integer("context_count").notNull(),
  successfulDelayedUse: integer("successful_delayed_use", { mode: "boolean" }).notNull(),
  nextReview: text("next_review"),
  sourceRelevance: real("source_relevance").notNull(),
  discussionUtility: real("discussion_utility").notNull(),
  collocations: text("collocations", { mode: "json" }).notNull(),
  examples: text("examples", { mode: "json" }).notNull(),
  sourceLabel: text("source_label"),
});

export const competencyStates = sqliteTable("competency_states", {
  id: text("id").primaryKey(),
  domain: text("domain").notNull(),
  label: text("label").notNull(),
  arabicLabel: text("arabic_label").notNull(),
  mode: text("mode").notNull(),
  masteryProbability: real("mastery_probability").notNull(),
  uncertainty: real("uncertainty").notNull(),
  automaticity: real("automaticity").notNull(),
  retentionHalfLifeDays: real("retention_half_life_days").notNull(),
  contextCount: integer("context_count").notNull(),
  medianRetrievalLatencyMs: integer("median_retrieval_latency_ms"),
  lastIndependentUse: text("last_independent_use"),
  nextReview: text("next_review"),
});

export const competencyNodes = sqliteTable("competency_nodes", {
  id: text("id").primaryKey(),
  domain: text("domain").notNull(),
  label: text("label").notNull(),
  arabicLabel: text("arabic_label").notNull(),
  description: text("description").notNull(),
});

export const competencyEdges = sqliteTable("competency_edges", {
  id: text("id").primaryKey(),
  fromNodeId: text("from_node_id").notNull(),
  toNodeId: text("to_node_id").notNull(),
  relation: text("relation").notNull(),
  weight: real("weight").notNull(),
});

export const learnerStates = sqliteTable("learner_states", {
  id: text("id").primaryKey(),
  competencyId: text("competency_id").notNull(),
  mode: text("mode").notNull(),
  masteryProbability: real("mastery_probability").notNull(),
  uncertainty: real("uncertainty").notNull(),
  automaticity: real("automaticity").notNull(),
  retentionHalfLifeDays: real("retention_half_life_days").notNull(),
  contextCount: integer("context_count").notNull(),
  medianRetrievalLatencyMs: integer("median_retrieval_latency_ms"),
  lastIndependentUse: text("last_independent_use"),
  nextReview: text("next_review"),
});

export const lexicalSenses = sqliteTable("lexical_senses", {
  id: text("id").primaryKey(),
  lemma: text("lemma").notNull(),
  vocalized: text("vocalized").notNull(),
  root: text("root").notNull(),
  classicalMeaning: text("classical_meaning").notNull(),
  contextualGloss: text("contextual_gloss").notNull(),
  register: text("register").notNull(),
  sourceLabel: text("source_label"),
});

export const formulaicSequences = sqliteTable("formulaic_sequences", {
  id: text("id").primaryKey(),
  arabic: text("arabic").notNull(),
  englishFunction: text("english_function").notNull(),
  discourseMove: text("discourse_move").notNull(),
  lexicalSenseId: text("lexical_sense_id"),
});

export const learningThreads = sqliteTable("learning_threads", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  triggerSignalId: text("trigger_signal_id").notNull(),
  kind: text("kind").notNull(),
  learnerGoal: text("learner_goal").notNull(),
  targetArabic: text("target_arabic"),
  relatedCompetencies: text("related_competencies", { mode: "json" }).notNull(),
  relatedPassages: text("related_passages", { mode: "json" }).notNull(),
  priority: real("priority").notNull(),
  status: text("status").notNull(),
  lastLearnerInterestAt: text("last_learner_interest_at").notNull(),
  successfulUses: integer("successful_uses").notNull(),
  sourceBridge: text("source_bridge"),
});

export const interactionSignals = sqliteTable("interaction_signals", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  turnId: text("turn_id").notNull(),
  type: text("type").notNull(),
  targetText: text("target_text"),
  intendedMeaning: text("intended_meaning"),
  confidence: real("confidence").notNull(),
  explicitness: real("explicitness").notNull(),
  persistence: real("persistence").notNull(),
  sourceRelevance: real("source_relevance").notNull(),
  detectedAt: text("detected_at").notNull(),
});

export const engagementSnapshots = sqliteTable("engagement_snapshots", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  engagementProbability: real("engagement_probability").notNull(),
  boredomProbability: real("boredom_probability").notNull(),
  overloadProbability: real("overload_probability").notNull(),
  fatigueProbability: real("fatigue_probability").notNull(),
  challengeLevel: real("challenge_level").notNull(),
  confidence: real("confidence").notNull(),
  supportingSignals: text("supporting_signals", { mode: "json" }).notNull(),
  windowStartTurnId: text("window_start_turn_id").notNull(),
  windowEndTurnId: text("window_end_turn_id").notNull(),
  createdAt: text("created_at").notNull(),
});

export const topicAffinities = sqliteTable("topic_affinities", {
  id: text("id").primaryKey(),
  topic: text("topic").notNull(),
  interestScore: real("interest_score").notNull(),
  evidenceCount: integer("evidence_count").notNull(),
  lastObservedAt: text("last_observed_at").notNull(),
});

export const sourceClaims = sqliteTable("source_claims", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull(),
  passageId: text("passage_id"),
  kind: text("kind").notNull(),
  text: text("text").notNull(),
  attribution: text("attribution"),
  verificationStatus: text("verification_status").notNull(),
});

export const evidenceEvents = sqliteTable("evidence_events", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  turnId: text("turn_id").notNull(),
  targetId: text("target_id").notNull(),
  targetKind: text("target_kind").notNull(),
  mode: text("mode").notNull(),
  success: integer("success", { mode: "boolean" }).notNull(),
  independenceWeight: real("independence_weight").notNull(),
  confidence: real("confidence").notNull(),
  retrievalLatencyMs: integer("retrieval_latency_ms"),
  createdAt: text("created_at").notNull(),
});

export const summaryAttempts = sqliteTable("summary_attempts", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  turnId: text("turn_id").notNull(),
  passageId: text("passage_id"),
  transcript: text("transcript").notNull(),
  ideaCompletion: real("idea_completion").notNull(),
  sourceFidelityConfidence: real("source_fidelity_confidence").notNull(),
  supportLevel: text("support_level").notNull(),
  createdAt: text("created_at").notNull(),
});

export const turnMetrics = sqliteTable("turn_metrics", {
  turnId: text("turn_id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  role: text("role").notNull(),
  responseOnsetMs: integer("response_onset_ms"),
  speechDurationMs: integer("speech_duration_ms"),
  pauseRatio: real("pause_ratio"),
  midClausePauses: integer("mid_clause_pauses"),
  repairCount: integer("repair_count"),
  interruptedTutor: integer("interrupted_tutor", { mode: "boolean" }),
  asrConfidence: real("asr_confidence"),
  sourceMode: text("source_mode").notNull(),
  createdAt: text("created_at").notNull(),
});

export const sessionDecisions = sqliteTable("session_decisions", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  turnId: text("turn_id").notNull(),
  action: text("action").notNull(),
  reason: text("reason").notNull(),
  targetSignalId: text("target_signal_id"),
  difficultyAxis: text("difficulty_axis"),
  createdAt: text("created_at").notNull(),
});

export const conversationThreads = sqliteTable("conversation_threads", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  topicSeed: text("topic_seed"),
  contextSummary: text("context_summary"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  lastOpenedAt: text("last_opened_at").notNull(),
  archived: integer("archived", { mode: "boolean" }).notNull(),
});

export const conversationThreadSources = sqliteTable("conversation_thread_sources", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  documentId: text("document_id").notNull(),
  position: integer("position").notNull(),
});

export const conversationTurns = sqliteTable("conversation_turns", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  role: text("role").notNull(),
  arabic: text("arabic").notNull(),
  english: text("english"),
  glosses: text("glosses", { mode: "json" }).notNull(),
  createdAt: text("created_at").notNull(),
  provisional: integer("provisional", { mode: "boolean" }).notNull(),
  sourceStatus: text("source_status"),
});
