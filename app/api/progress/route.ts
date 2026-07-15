import { NextResponse } from "next/server";
import { getCompetencies, getCompetencyGraph, getProgress } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ progress: getProgress(), competencies: getCompetencies(), competencyGraph: getCompetencyGraph() });
}
