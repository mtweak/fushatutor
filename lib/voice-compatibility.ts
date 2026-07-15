export type VoiceEnvironment = {
  isSecureContext: boolean;
  hasGetUserMedia: boolean;
};

export function getVoiceEnvironmentIssue(environment: VoiceEnvironment): string | undefined {
  if (!environment.isSecureContext) {
    return "Microphone access is blocked on this address. On a phone, open the tutor over HTTPS; plain HTTP works only on localhost.";
  }
  if (!environment.hasGetUserMedia) {
    return "This browser does not provide microphone capture. Try the current Safari or Chrome browser, or use the text field.";
  }
  return undefined;
}

export function microphoneErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Microphone access is blocked. Allow microphone permission for this site in your browser settings, then try again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphone was found. Connect or enable a microphone, then try again.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The microphone is already in use by another app or browser tab. Close it there, then try again.";
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "This device could not use the requested microphone settings. Try again with another browser or microphone.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "The microphone could not be started.";
}
