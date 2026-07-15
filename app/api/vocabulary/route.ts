import { NextResponse } from "next/server";
import { acquisitionPriority } from "@/lib/learner-model";
import { getVocabulary } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const vocabulary = getVocabulary().map((item) => ({ ...item, acquisitionPriority: acquisitionPriority(item) }));
  return NextResponse.json({ vocabulary });
}
