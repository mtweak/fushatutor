import { NextResponse } from "next/server";
import { attachSourceToConversation, detachSourceFromConversation, getConversation, getSources } from "@/lib/db";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; sourceId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { id, sourceId } = await context.params;
  const conversation = getConversation(id);
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  if (!getSources().some((source) => source.id === sourceId)) {
    return NextResponse.json({ error: "Source not found." }, { status: 404 });
  }
  if (!conversation.sourceIds.includes(sourceId) && conversation.sourceIds.length >= 20) {
    return NextResponse.json({ error: "This conversation already has the maximum of 20 attached sources." }, { status: 400 });
  }
  attachSourceToConversation(sourceId, id);
  return NextResponse.json({ conversation: getConversation(id) });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id, sourceId } = await context.params;
  if (!getConversation(id)) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  detachSourceFromConversation(sourceId, id);
  return NextResponse.json({ conversation: getConversation(id) });
}
