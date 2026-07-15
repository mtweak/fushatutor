import { TUTOR_POLICY } from "@/lib/tutor-policy";

export function buildRealtimeSessionConfig(input: {
  model: string;
  voice: string;
  instructions: string;
}) {
  return {
    type: "realtime" as const,
    model: input.model,
    instructions: input.instructions,
    audio: {
      input: {
        transcription: { model: "gpt-realtime-whisper", language: "ar" },
        turn_detection: {
          type: "semantic_vad" as const,
          eagerness: TUTOR_POLICY.voice.semanticVadEagerness,
          create_response: true,
          interrupt_response: true,
        },
      },
      output: { voice: input.voice },
    },
    tools: [
      {
        type: "function" as const,
        name: "capture_learning_signal",
        description: "Record an explicit learner goal, failed attempt, missing word, desired construction, or strong topic interest.",
        parameters: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["explicit_learning_request", "failed_communicative_attempt", "lexical_gap", "construction_attempt", "meaning_uncertainty", "topic_interest"],
            },
            targetText: { type: "string" },
            intendedMeaning: { type: "string" },
          },
          required: ["type"],
          additionalProperties: false,
        },
      },
    ],
    tool_choice: "auto" as const,
  };
}
