export type KnowledgeMode =
  | "reading_recognition"
  | "listening_comprehension"
  | "meaning_recall"
  | "cued_production"
  | "spontaneous_production"
  | "delayed_transfer";

export type VocabularyStatus = "to_acquire" | "learning" | "mastered";

export type CompetencyDomain =
  | "vocabulary"
  | "grammar"
  | "listening"
  | "pronunciation"
  | "fluency"
  | "numeracy"
  | "idiom_pragmatics"
  | "summarization"
  | "discourse_management"
  | "source_fidelity";

export type InteractionSignalType =
  | "explicit_learning_request"
  | "failed_communicative_attempt"
  | "lexical_gap"
  | "construction_attempt"
  | "meaning_uncertainty"
  | "self_repair_cluster"
  | "topic_interest"
  | "spontaneous_elaboration"
  | "desire_to_interrupt"
  | "possible_boredom"
  | "possible_overload"
  | "possible_fatigue";

export type LearningThreadKind =
  | "word"
  | "phrase"
  | "construction"
  | "concept"
  | "discussion_move";

export type LearningThreadStatus =
  | "active"
  | "woven_in"
  | "bookmarked"
  | "completed"
  | "expired";

export type OrchestrationAction =
  | "follow_now"
  | "weave_in"
  | "bookmark"
  | "bridge_to_text"
  | "confirm_gently"
  | "continue_flow"
  | "raise_novelty"
  | "reduce_load";

export type SessionView = "session" | "vocabulary" | "progress" | "sources";

export interface InteractionSignal {
  id: string;
  conversationId: string;
  turnId: string;
  type: InteractionSignalType;
  targetText?: string;
  intendedMeaning?: string;
  confidence: number;
  explicitness: number;
  persistence: number;
  sourceRelevance: number;
  detectedAt: string;
}

export interface LearningThread {
  id: string;
  conversationId: string;
  triggerSignalId: string;
  kind: LearningThreadKind;
  learnerGoal: string;
  targetArabic?: string;
  relatedCompetencies: string[];
  relatedPassages: string[];
  priority: number;
  status: LearningThreadStatus;
  lastLearnerInterestAt: string;
  successfulUses: number;
  sourceBridge?: string;
}

export interface LearnerState {
  competencyId: string;
  domain: CompetencyDomain;
  label: string;
  arabicLabel: string;
  mode: KnowledgeMode;
  masteryProbability: number;
  uncertainty: number;
  automaticity: number;
  retentionHalfLifeDays: number;
  contextCount: number;
  medianRetrievalLatencyMs?: number;
  lastIndependentUse?: string;
  nextReview?: string;
}

export interface CompetencyNode {
  id: string;
  domain: CompetencyDomain;
  label: string;
  arabicLabel: string;
  description: string;
}

export interface CompetencyEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relation: "prerequisite" | "supports" | "transfers_to" | "contrasts_with";
  weight: number;
}

export interface AdaptiveFocus {
  competencyId: string;
  domain: CompetencyDomain;
  label: string;
  arabicLabel: string;
  adjustment: "upshift" | "hold" | "downshift";
  difficultyAxis: NonNullable<OrchestrationDecision["difficultyAxis"]>;
  rationale: string;
  masteryProbability: number;
  targetSuccessBand: [number, number];
}

export interface VocabularyItem {
  id: string;
  lemma: string;
  vocalized: string;
  root: string;
  sense: string;
  englishGloss: string;
  technicalGloss?: string;
  register: "classical" | "literary" | "general" | "formulaic";
  status: VocabularyStatus;
  comprehension: number;
  production: number;
  automaticity: number;
  uncertainty: number;
  retentionHalfLifeDays: number;
  contextCount: number;
  successfulDelayedUse: boolean;
  nextReview?: string;
  sourceRelevance: number;
  discussionUtility: number;
  collocations: string[];
  examples: string[];
  sourceLabel?: string;
}

export interface EngagementState {
  engagementProbability: number;
  boredomProbability: number;
  overloadProbability: number;
  fatigueProbability: number;
  challengeLevel: number;
  confidence: number;
  supportingSignals: string[];
  windowStartTurnId: string;
  windowEndTurnId: string;
}

export interface TurnMetrics {
  responseOnsetMs?: number;
  speechDurationMs?: number;
  pauseRatio?: number;
  midClausePauses?: number;
  repairCount?: number;
  interruptedTutor?: boolean;
  asrConfidence?: number;
}

export interface GlossToken {
  arabic: string;
  english: string;
  root?: string;
}

export interface ConversationTurn {
  id: string;
  conversationId: string;
  role: "tutor" | "learner";
  arabic: string;
  english?: string;
  glosses: GlossToken[];
  createdAt: string;
  provisional?: boolean;
  sourceStatus?: "verified_quote" | "source_paraphrase" | "attributed_background" | "illustrative_only";
}

export interface ConversationThread {
  id: string;
  title: string;
  topicSeed?: string;
  contextSummary?: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  archived: boolean;
  sourceIds: string[];
  sourceLabels: string[];
  turnCount: number;
}

export interface SourcePassage {
  id: string;
  documentId: string;
  page?: number;
  sequence: number;
  arabic: string;
  citationLabel: string;
  isDirectQuote: boolean;
  concepts: string[];
}

export interface SourceDocument {
  id: string;
  title: string;
  author?: string;
  genre: string;
  edition?: string;
  createdAt: string;
  sourceType?: "text" | "course_book_unit";
  collectionId?: string;
  collectionTitle?: string;
  sectionLabel?: string;
  pageStart?: number;
  pageEnd?: number;
  fileName?: string;
  fileHash?: string;
  promptPageCount?: number;
  passages: SourcePassage[];
}

export interface Preferences {
  sessionMinutes: number;
  majlisShare: number;
  glossMode: "tap" | "always" | "hidden";
  engagementAdaptation: boolean;
  explicitExplanations: boolean;
  voice: string;
}

export interface OrchestrationDecision {
  action: OrchestrationAction;
  reason: string;
  targetSignalId?: string;
  thread?: LearningThread;
  difficultyAxis?: "speech_speed" | "audio_length" | "syntax" | "lexical_rarity" | "abstraction" | "support";
}

export interface TurnAnalysis {
  signals: InteractionSignal[];
  engagement: EngagementState;
  decision: OrchestrationDecision;
  suggestedReply: string;
  vocalizedTranscript?: string;
  glosses?: GlossToken[];
  learningTargetArabic?: string;
  vocabularyEvidence: Array<{
    vocabularyId: string;
    mode: KnowledgeMode;
    success: boolean;
    independenceWeight: number;
    confidence: number;
    retrievalLatencyMs?: number;
  }>;
}

export interface ProgressSummary {
  majlisReadiness: number;
  activeVocabulary: number;
  masteredVocabulary: number;
  dueForReview: number;
  learnerSpeechShare: number;
  medianResponseOnsetMs?: number;
  longestLearnerTurnMs?: number;
  nextFocus: AdaptiveFocus;
  dimensions: Array<{ id: string; label: string; arabicLabel: string; value: number; trend: number }>;
}

export interface BootstrapData {
  configured: boolean;
  activeConversationId: string;
  conversations: ConversationThread[];
  turns: ConversationTurn[];
  vocabulary: VocabularyItem[];
  competencies: LearnerState[];
  competencyGraph: { nodes: CompetencyNode[]; edges: CompetencyEdge[] };
  threads: LearningThread[];
  sources: SourceDocument[];
  sourceLibrary: SourceDocument[];
  progress: ProgressSummary;
  preferences: Preferences;
}
