import { NextResponse } from "next/server";
import { z } from "zod";
import { getConversation, openConversation, updateConversation } from "@/lib/db";

export const runtime = "nodejs";

const updateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  topicSeed: z.string().trim().max(2_000).optional(),
  contextSummary: z.string().trim().max(4_000).optional(),
  sourceIds: z.array(z.string().min(1)).max(20).optional(),
  archived: z.boolean().optional(),
  open: z.boolean().optional(),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const conversation = getConversation(id);
  return conversation
    ? NextResponse.json({ conversation })
    : NextResponse.json({ error: "Conversation not found." }, { status: 404 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const current = getConversation(id);
  if (!current) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  if (parsed.data.open) openConversation(id);
  const updates = { ...parsed.data };
  delete updates.open;
  const conversation = Object.keys(updates).length ? updateConversation(id, updates) : getConversation(id);
  return NextResponse.json({ conversation, archived: Boolean(parsed.data.archived) });
}
