"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TurnMetrics } from "@/lib/types";
import { TUTOR_POLICY } from "@/lib/tutor-policy";
import { getVoiceEnvironmentIssue, microphoneErrorMessage } from "@/lib/voice-compatibility";
import { setMicrophoneStreamOpen } from "@/lib/push-to-talk";

export type VoiceStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "listening"
  | "processing"
  | "speaking"
  | "muted"
  | "error";

type Mode = "realtime" | "demo" | null;

export function useRealtimeTutor(options: {
  conversationId: string;
  onLearnerTranscript: (text: string, mode: "realtime" | "demo", metrics?: TurnMetrics) => Promise<string | void>;
  onTutorTranscript: (text: string) => Promise<void> | void;
  onDataChanged?: () => void;
}) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [mode, setMode] = useState<Mode>(null);
  const [error, setError] = useState<string>();
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [microphoneOpen, setMicrophoneOpen] = useState(false);
  const statusRef = useRef<VoiceStatus>("idle");
  const microphoneOpenRef = useRef(false);
  const peerRef = useRef<RTCPeerConnection | undefined>(undefined);
  const dataChannelRef = useRef<RTCDataChannel | undefined>(undefined);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const audioRef = useRef<HTMLAudioElement | undefined>(undefined);
  const recognitionRef = useRef<SpeechRecognition | undefined>(undefined);
  const tutorTranscriptRef = useRef("");
  const learnerSpeechStartedAtRef = useRef<number | undefined>(undefined);
  const learnerSpeechDurationRef = useRef<number | undefined>(undefined);
  const interruptedTutorRef = useRef(false);

  const speakDemo = useCallback((text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ar-SA";
    utterance.rate = 0.88;
    const arabicVoice = window.speechSynthesis.getVoices().find((voice) => voice.lang.startsWith("ar"));
    if (arabicVoice) utterance.voice = arabicVoice;
    utterance.onstart = () => setStatus("speaking");
    utterance.onend = () => setStatus(microphoneOpenRef.current ? "ready" : "muted");
    window.speechSynthesis.speak(utterance);
  }, []);

  const processDemoTranscript = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setInterimTranscript("");
      setStatus("processing");
      const reply = await options.onLearnerTranscript(text.trim(), "demo");
      if (reply) speakDemo(reply);
      else setStatus(microphoneOpenRef.current ? "ready" : "muted");
      options.onDataChanged?.();
    },
    [options, speakDemo],
  );

  const startDemoRecognition = useCallback(() => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      microphoneOpenRef.current = false;
      setMicrophoneOpen(false);
      setError("Browser speech recognition is unavailable. Use the text field, or configure OPENAI_API_KEY for Realtime voice.");
      setStatus("muted");
      return;
    }
    window.speechSynthesis?.cancel();
    const recognition = new Recognition();
    recognition.lang = "ar-SA";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let finalText = "";
      let interim = "";
      for (let index = event.results.length - 1; index >= 0; index -= 1) {
        const result = event.results[index];
        if (result.isFinal) finalText = `${result[0].transcript} ${finalText}`;
        else interim = `${result[0].transcript} ${interim}`;
      }
      setInterimTranscript(interim.trim());
      if (finalText.trim()) void processDemoTranscript(finalText.trim());
    };
    recognition.onerror = (event) => {
      microphoneOpenRef.current = false;
      setMicrophoneOpen(false);
      setError(event.error === "not-allowed" ? "Microphone permission is required for voice practice." : `Voice input stopped: ${event.error}`);
      setStatus("muted");
    };
    recognition.onend = () => {
      microphoneOpenRef.current = false;
      setMicrophoneOpen(false);
      setStatus((current) => (current === "listening" ? "muted" : current));
    };
    recognitionRef.current = recognition;
    setError(undefined);
    setStatus("listening");
    recognition.start();
  }, [processDemoTranscript]);

  const handleFunctionCall = useCallback(async (event: Record<string, unknown>) => {
    const name = event.name as string | undefined;
    if (name !== "capture_learning_signal") return;
    const callId = event.call_id as string | undefined;
    try {
      const args = JSON.parse(String(event.arguments || "{}")) as Record<string, unknown>;
      const response = await fetch("/api/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...args, conversationId: options.conversationId, turnId: `realtime-${Date.now()}` }),
      });
      const result = await response.json();
      if (callId && dataChannelRef.current?.readyState === "open") {
        dataChannelRef.current.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: { type: "function_call_output", call_id: callId, output: JSON.stringify(result) },
          }),
        );
      }
      options.onDataChanged?.();
    } catch {
      // The voice conversation should continue even if background signal logging fails.
    }
  }, [options]);

  const handleRealtimeEvent = useCallback(
    (raw: MessageEvent<string>) => {
      const event = JSON.parse(raw.data) as Record<string, unknown>;
      const type = String(event.type || "");
      if (type === "input_audio_buffer.speech_started") {
        interruptedTutorRef.current = statusRef.current === "speaking";
        if (audioRef.current) audioRef.current.muted = true;
        learnerSpeechStartedAtRef.current = performance.now();
        setStatus("listening");
      } else if (type === "input_audio_buffer.speech_stopped") {
        learnerSpeechDurationRef.current = learnerSpeechStartedAtRef.current
          ? Math.round(performance.now() - learnerSpeechStartedAtRef.current)
          : undefined;
        setStatus("processing");
      } else if (type === "response.created") {
        if (audioRef.current) audioRef.current.muted = false;
        tutorTranscriptRef.current = "";
      } else if (type.includes("output_audio_transcript.delta") || type === "response.audio_transcript.delta") {
        if (audioRef.current) audioRef.current.muted = false;
        tutorTranscriptRef.current += String(event.delta || "");
        setInterimTranscript(tutorTranscriptRef.current);
        setStatus("speaking");
      } else if (type.includes("output_audio_transcript.done") || type === "response.audio_transcript.done") {
        const transcript = String(event.transcript || tutorTranscriptRef.current).trim();
        tutorTranscriptRef.current = "";
        setInterimTranscript("");
        setStatus(microphoneOpenRef.current ? "ready" : "muted");
        if (transcript) void options.onTutorTranscript(transcript);
      } else if (type === "conversation.item.input_audio_transcription.completed") {
        const transcript = String(event.transcript || "").trim();
        if (transcript) {
          void options
            .onLearnerTranscript(transcript, "realtime", {
              speechDurationMs: learnerSpeechDurationRef.current,
              interruptedTutor: interruptedTutorRef.current,
              asrConfidence: 0.82,
            })
            .finally(() => options.onDataChanged?.());
        }
      } else if (type === "response.function_call_arguments.done") {
        void handleFunctionCall(event);
      } else if (type === "error") {
        const detail = event.error as { message?: string } | undefined;
        setError(detail?.message || "The Realtime session reported an error.");
        setStatus("error");
      }
    },
    [handleFunctionCall, options],
  );

  const start = useCallback(async () => {
    setError(undefined);
    setNeedsAudioUnlock(false);
    setStatus("connecting");
    const environmentIssue = getCurrentVoiceEnvironmentIssue();
    if (environmentIssue) {
      setError(environmentIssue);
      setStatus("error");
      return;
    }

    let peer: RTCPeerConnection | undefined;
    let audio: HTMLAudioElement | undefined;
    let stream: MediaStream | undefined;
    let channel: RTCDataChannel | undefined;
    try {
      await assertMicrophonePermissionAvailable();
      stream = await getMicrophoneStream();
      setMicrophoneStreamOpen(stream, false);
      microphoneOpenRef.current = false;
      setMicrophoneOpen(false);

      const tokenResponse = await fetch("/api/realtime/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: options.conversationId }),
      });
      const session = (await tokenResponse.json()) as { mode: "demo" | "realtime"; value?: string; error?: string };
      if (!tokenResponse.ok) throw new Error(session.error || "Could not create the voice session.");
      if (session.mode === "demo") {
        stream.getTracks().forEach((track) => track.stop());
        stream = undefined;
        setMode("demo");
        setStatus("muted");
        return;
      }
      if (!session.value) throw new Error("Realtime session token was missing.");

      peer = new RTCPeerConnection();
      audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "");
      audio.setAttribute("aria-hidden", "true");
      audio.dataset.fushaRealtimeAudio = "true";
      audio.volume = 1;
      audio.muted = false;
      document.body.appendChild(audio);
      audioRef.current = audio;
      if (!stream) throw new Error("Microphone stream was unavailable.");
      const activePeer = peer;
      const activeAudio = audio;
      const activeStream = stream;
      activePeer.ontrack = (event) => {
        activeAudio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        activeAudio.muted = false;
        void activeAudio.play()
          .then(() => setNeedsAudioUnlock(false))
          .catch(() => setNeedsAudioUnlock(true));
      };
      activeStream.getTracks().forEach((track) => activePeer.addTrack(track, activeStream));
      channel = activePeer.createDataChannel("oai-events");
      channel.addEventListener("message", handleRealtimeEvent);
      channel.addEventListener("open", () => setStatus("muted"));
      channel.addEventListener("close", () => setStatus("idle"));
      activePeer.addEventListener("connectionstatechange", () => {
        if (activePeer.connectionState === "failed") {
          setError("The live voice connection failed. Check your network and try again.");
          setStatus("error");
        }
      });

      const offer = await activePeer.createOffer();
      await activePeer.setLocalDescription(offer);
      const answerResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${session.value}`, "Content-Type": "application/sdp" },
      });
      if (!answerResponse.ok) throw new Error(await answerResponse.text());
      await activePeer.setRemoteDescription({ type: "answer", sdp: await answerResponse.text() });

      peerRef.current = activePeer;
      dataChannelRef.current = channel;
      streamRef.current = activeStream;
      setMode("realtime");
    } catch (caught) {
      stream?.getTracks().forEach((track) => track.stop());
      channel?.close();
      peer?.close();
      if (audio) {
        audio.srcObject = null;
        audio.remove();
      }
      if (audioRef.current === audio) audioRef.current = undefined;
      setError(microphoneErrorMessage(caught));
      setStatus("error");
    }
  }, [handleRealtimeEvent, options.conversationId]);

  const stop = useCallback(() => {
    recognitionRef.current?.abort();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    dataChannelRef.current?.close();
    peerRef.current?.close();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
      audioRef.current.remove();
    }
    window.speechSynthesis?.cancel();
    recognitionRef.current = undefined;
    streamRef.current = undefined;
    dataChannelRef.current = undefined;
    peerRef.current = undefined;
    audioRef.current = undefined;
    setMode(null);
    setStatus("idle");
    microphoneOpenRef.current = false;
    setMicrophoneOpen(false);
    setInterimTranscript("");
    setNeedsAudioUnlock(false);
  }, []);

  const enableAudio = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.muted = false;
      audio.volume = 1;
      await audio.play();
      setNeedsAudioUnlock(false);
      setError(undefined);
    } catch {
      setNeedsAudioUnlock(true);
      setError("Sound is still blocked. Turn off silent mode, raise media volume, and allow autoplay for this site.");
    }
  }, []);

  const beginPushToTalk = useCallback(() => {
    if (microphoneOpenRef.current) return;
    microphoneOpenRef.current = true;
    setMicrophoneOpen(true);
    if (mode === "demo") {
      startDemoRecognition();
      return;
    }
    if (!setMicrophoneStreamOpen(streamRef.current, true)) {
      microphoneOpenRef.current = false;
      setMicrophoneOpen(false);
      return;
    }
    setStatus("listening");
  }, [mode, startDemoRecognition]);

  const endPushToTalk = useCallback(() => {
    if (!microphoneOpenRef.current) return;
    microphoneOpenRef.current = false;
    setMicrophoneOpen(false);
    if (mode === "demo") recognitionRef.current?.stop();
    else setMicrophoneStreamOpen(streamRef.current, false);
    setStatus((current) => (current === "listening" || current === "ready" ? "muted" : current));
  }, [mode]);

  useEffect(() => stop, [stop]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  return {
    status,
    mode,
    error,
    needsAudioUnlock,
    interimTranscript,
    microphoneOpen,
    start,
    stop,
    beginPushToTalk,
    endPushToTalk,
    enableAudio,
    speakDemo,
  };
}

async function getMicrophoneStream(): Promise<MediaStream> {
  return new Promise<MediaStream>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      settled = true;
      reject(new Error("Microphone permission is still waiting. Allow microphone access in the browser, then try again."));
    }, TUTOR_POLICY.voice.microphonePermissionTimeoutMs);
    navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    }).then((stream) => {
      window.clearTimeout(timer);
      if (settled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      settled = true;
      resolve(stream);
    }).catch((error) => {
      window.clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function getCurrentVoiceEnvironmentIssue(): string | undefined {
  return getVoiceEnvironmentIssue({
    isSecureContext: window.isSecureContext,
    hasGetUserMedia: Boolean(navigator.mediaDevices?.getUserMedia),
  });
}

async function assertMicrophonePermissionAvailable() {
  if (!navigator.permissions?.query) return;
  try {
    const permission = await navigator.permissions.query({ name: "microphone" as PermissionName });
    if (permission.state === "denied") throw new DOMException("Microphone permission denied", "NotAllowedError");
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") throw error;
    // Safari does not currently expose the microphone permission through Permissions.query.
  }
}
