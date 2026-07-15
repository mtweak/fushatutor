let activePronunciation: HTMLAudioElement | undefined;

export async function playArabic(value: string): Promise<void> {
  const text = value.trim();
  if (!text || typeof window === "undefined") return;
  activePronunciation?.pause();
  const audio = new Audio(`/api/audio/speech?text=${encodeURIComponent(text)}`);
  audio.preload = "auto";
  audio.setAttribute("playsinline", "");
  activePronunciation = audio;
  try {
    await audio.play();
  } catch {
    speakWithDeviceVoice(text);
  }
}

function speakWithDeviceVoice(text: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ar-SA";
  utterance.rate = 0.78;
  const arabicVoice = window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("ar"));
  if (arabicVoice) utterance.voice = arabicVoice;
  window.speechSynthesis.speak(utterance);
}
