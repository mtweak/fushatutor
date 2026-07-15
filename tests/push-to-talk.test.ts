import { describe, expect, it } from "vitest";
import { isPushToTalkKey, setMicrophoneStreamOpen } from "@/lib/push-to-talk";

describe("push-to-talk microphone gating", () => {
  it("opens and closes every microphone track", () => {
    const tracks = [{ enabled: true }, { enabled: true }];
    const stream = { getAudioTracks: () => tracks };

    expect(setMicrophoneStreamOpen(stream, false)).toBe(2);
    expect(tracks.every((track) => !track.enabled)).toBe(true);
    setMicrophoneStreamOpen(stream, true);
    expect(tracks.every((track) => track.enabled)).toBe(true);
  });

  it("supports hold-to-speak from keyboard without treating other keys as speech", () => {
    expect(isPushToTalkKey(" ")).toBe(true);
    expect(isPushToTalkKey("Enter")).toBe(true);
    expect(isPushToTalkKey("Tab")).toBe(false);
  });
});
