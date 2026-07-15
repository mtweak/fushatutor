import { describe, expect, it } from "vitest";
import { buildRealtimeSessionConfig } from "@/lib/realtime-config";

describe("realtime voice configuration", () => {
  it("waits through formulation pauses while allowing immediate interruption", () => {
    const config = buildRealtimeSessionConfig({
      model: "gpt-realtime-2.1",
      voice: "marin",
      instructions: "Speak Fuṣḥā.",
    });
    expect(config.audio.input.turn_detection).toMatchObject({
      type: "semantic_vad",
      eagerness: "low",
      interrupt_response: true,
      create_response: true,
    });
  });

  it("exposes only the bounded learner-signal tool to the fast loop", () => {
    const config = buildRealtimeSessionConfig({ model: "realtime", voice: "marin", instructions: "test" });
    expect(config.tools).toHaveLength(1);
    expect(config.tools[0].name).toBe("capture_learning_signal");
    expect(config.tools[0].parameters.additionalProperties).toBe(false);
  });
});
