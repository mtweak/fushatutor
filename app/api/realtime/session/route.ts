import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getCompetencies, getConversation, getConversations, getSources, getThreads, getPreferences } from "@/lib/db";
import { buildRealtimeInstructions } from "@/lib/prompts";
import { buildRealtimeSessionConfig } from "@/lib/realtime-config";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ mode: "demo", reason: "OPENAI_API_KEY is not configured." });
  }

  const preferences = getPreferences();
  const body = await request.json().catch(() => ({})) as { conversationId?: string };
  const conversation = (body.conversationId ? getConversation(body.conversationId) : undefined) ?? getConversations()[0];
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  const instructions = buildRealtimeInstructions({
    threads: getThreads(conversation.id),
    competencies: getCompetencies(),
    sources: getSources(conversation.id),
    conversation,
  });
  const model = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1";
  const voice = preferences.voice || process.env.OPENAI_REALTIME_VOICE || "cedar";
  const safetyId = createHash("sha256").update("fusha-local-learner").digest("hex");

  const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": safetyId,
    },
    body: JSON.stringify({
      session: buildRealtimeSessionConfig({ model, voice, instructions }),
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    return NextResponse.json(
      { error: "Realtime session could not be created.", details: data },
      { status: response.status },
    );
  }
  return NextResponse.json({ mode: "realtime", ...data, model, voice });
}
