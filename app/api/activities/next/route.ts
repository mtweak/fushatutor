import { NextResponse } from "next/server";
import { acquisitionPriority, recommendAdaptiveFocus } from "@/lib/learner-model";
import { getCompetencies, getThreads, getVocabulary, latestEngagement } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const conversationId = new URL(request.url).searchParams.get("conversationId") || undefined;
  const thread = getThreads(conversationId).find((item) => item.status === "active" || item.status === "woven_in");
  const vocabulary = [...getVocabulary()].sort((a, b) => acquisitionPriority(b) - acquisitionPriority(a))[0];
  const engagement = latestEngagement(conversationId);
  const focus = recommendAdaptiveFocus(getCompetencies(), engagement);
  return NextResponse.json({
    activity: {
      kind: thread ? "learner_thread" : "retrieval",
      thread,
      vocabulary,
      focus,
      supportLevel: engagement && engagement.overloadProbability > 0.65 ? "visual_and_stem" : "minimal",
    },
  });
}
