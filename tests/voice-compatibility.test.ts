import { describe, expect, it } from "vitest";
import { getVoiceEnvironmentIssue, microphoneErrorMessage } from "@/lib/voice-compatibility";

describe("mobile voice compatibility", () => {
  it("explains why a phone cannot use a microphone over plain HTTP", () => {
    expect(getVoiceEnvironmentIssue({ isSecureContext: false, hasGetUserMedia: false })).toContain("HTTPS");
  });

  it("accepts a secure browser with media capture", () => {
    expect(getVoiceEnvironmentIssue({ isSecureContext: true, hasGetUserMedia: true })).toBeUndefined();
  });

  it("turns permission denials into an actionable message", () => {
    const denied = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    expect(microphoneErrorMessage(denied)).toContain("browser settings");
  });
});
