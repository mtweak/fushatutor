export type MicrophoneStream = {
  getAudioTracks: () => Array<{ enabled: boolean }>;
};

export function setMicrophoneStreamOpen(stream: MicrophoneStream | undefined, open: boolean): number {
  const tracks = stream?.getAudioTracks() ?? [];
  tracks.forEach((track) => {
    track.enabled = open;
  });
  return tracks.length;
}

export function isPushToTalkKey(key: string): boolean {
  return key === " " || key === "Enter";
}
