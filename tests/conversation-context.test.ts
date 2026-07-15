import { describe, expect, it } from "vitest";
import { buildRealtimeInstructions } from "@/lib/prompts";
import type { ConversationThread } from "@/lib/types";

describe("conversation workspace context", () => {
  it("places only the selected conversation seed in the realtime prompt", () => {
    const astronomy = promptFor(conversation("astronomy", "فَلَكٌ وَنُجُومٌ", "Discuss the night sky."));
    const tazkiya = promptFor(conversation("tazkiya", "مَجْلِسُ الْمَقَامَاتِ", "Explain maqām and ḥāl."));

    expect(astronomy).toContain("Discuss the night sky.");
    expect(astronomy).not.toContain("Explain maqām and ḥāl.");
    expect(tazkiya).toContain("Explain maqām and ḥāl.");
    expect(tazkiya).not.toContain("Discuss the night sky.");
    expect(tazkiya).toContain("do not import subject matter from other conversations");
  });

  it("makes conversational momentum outrank unsolicited correction", () => {
    const prompt = promptFor(conversation("daily", "حَدِيثٌ يَوْمِيٌّ", "Talk about the learner's day."));

    expect(prompt).toContain("CONVERSATION-FIRST POLICY");
    expect(prompt).toContain("If the learner's meaning is understandable, respond to the content");
    expect(prompt).toContain("Do not ask the learner to repeat improved wording");
    expect(prompt).toContain("downshift exactly one difficulty axis and preserve the topic");
  });
});

function promptFor(selected: ConversationThread): string {
  return buildRealtimeInstructions({ threads: [], competencies: [], sources: [], conversation: selected });
}

function conversation(id: string, title: string, topicSeed: string): ConversationThread {
  return {
    id,
    title,
    topicSeed,
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
    lastOpenedAt: "2026-07-14T00:00:00.000Z",
    archived: false,
    sourceIds: [],
    sourceLabels: [],
    turnCount: 0,
  };
}
