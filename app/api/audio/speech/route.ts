import { NextResponse } from "next/server";
import { getPreferences } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const text = new URL(request.url).searchParams.get("text")?.trim() || "";
  if (!text || text.length > 180 || !/[\u0600-\u06ff]/.test(text)) {
    return NextResponse.json({ error: "A short Arabic word or phrase is required." }, { status: 400 });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OpenAI voice is not configured." }, { status: 503 });

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
      voice: getPreferences().voice || process.env.OPENAI_TTS_VOICE || "cedar",
      input: text,
      instructions: "Speak only the supplied Arabic. Use clear, natural literary Fuṣḥā pronunciation and measured native cadence.",
      response_format: "mp3",
    }),
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    return NextResponse.json({ error: "Pronunciation audio could not be generated." }, { status: response.status || 502 });
  }
  return new NextResponse(response.body, {
    headers: {
      "Content-Type": response.headers.get("content-type") || "audio/mpeg",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
