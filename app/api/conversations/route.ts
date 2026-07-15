import { NextResponse } from "next/server";
import { z } from "zod";
import { createConversation, getConversations } from "@/lib/db";

export const runtime = "nodejs";

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  topicSeed: z.string().trim().max(2_000).optional(),
  contextSummary: z.string().trim().max(4_000).optional(),
  sourceIds: z.array(z.string().min(1)).max(20).default([]),
});

export async function GET() {
  return NextResponse.json({ conversations: getConversations() });
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  return NextResponse.json({ conversation: createConversation(parsed.data) }, { status: 201 });
}
