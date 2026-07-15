import { NextResponse } from "next/server";
import { getThreads } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const conversationId = new URL(request.url).searchParams.get("conversationId") || undefined;
  return NextResponse.json({ threads: getThreads(conversationId) });
}
