import { NextResponse } from "next/server";
import { setThreadStatus } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const thread = setThreadStatus(id, "expired");
  return thread ? NextResponse.json({ thread }) : NextResponse.json({ error: "Thread not found" }, { status: 404 });
}
