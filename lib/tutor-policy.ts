export const TUTOR_POLICY = {
  flow: {
    successBand: [0.7, 0.85] as [number, number],
    minimumLearnerSpeechShare: 0.6,
  },
  engagement: {
    boredomActionThreshold: 0.58,
    overloadActionThreshold: 0.68,
    ambiguousCueThreshold: 0.62,
  },
  mastery: {
    spontaneousProduction: 0.85,
    listeningComprehension: 0.9,
    maximumUncertainty: 0.12,
    minimumContexts: 3,
  },
  threadPriority: {
    explicitRequest: 0.3,
    persistence: 0.25,
    communicativeUsefulness: 0.2,
    observedInterest: 0.15,
    sourceRelevance: 0.1,
  },
  voice: {
    semanticVadEagerness: "low" as const,
    microphonePermissionTimeoutMs: 12_000,
  },
} as const;

export type TutorPolicy = typeof TUTOR_POLICY;

export function createTutorPolicy(overrides: {
  flow?: Partial<TutorPolicy["flow"]>;
  engagement?: Partial<TutorPolicy["engagement"]>;
  mastery?: Partial<TutorPolicy["mastery"]>;
  threadPriority?: Partial<TutorPolicy["threadPriority"]>;
  voice?: Partial<TutorPolicy["voice"]>;
} = {}): TutorPolicy {
  return {
    flow: { ...TUTOR_POLICY.flow, ...overrides.flow },
    engagement: { ...TUTOR_POLICY.engagement, ...overrides.engagement },
    mastery: { ...TUTOR_POLICY.mastery, ...overrides.mastery },
    threadPriority: { ...TUTOR_POLICY.threadPriority, ...overrides.threadPriority },
    voice: { ...TUTOR_POLICY.voice, ...overrides.voice },
  } as TutorPolicy;
}
