import { NextResponse } from "next/server";
import { z } from "zod";
import { getPreferences, updatePreferences } from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({
  sessionMinutes: z.number().int().min(5).max(90).optional(),
  majlisShare: z.number().min(0).max(1).optional(),
  glossMode: z.enum(["tap", "always", "hidden"]).optional(),
  engagementAdaptation: z.boolean().optional(),
  explicitExplanations: z.boolean().optional(),
  voice: z.string().min(1).optional(),
});

export async function GET() {
  return NextResponse.json({ preferences: getPreferences() });
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  return NextResponse.json({ preferences: updatePreferences(parsed.data) });
}
