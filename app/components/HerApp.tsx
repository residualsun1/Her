"use client";
/* eslint-disable @next/next/no-img-element -- object URLs and canvas fallbacks cannot use Next image optimization */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  DEFAULT_PARTICLE_TUNING,
  ParticleGarden,
  type ParticleTuning,
} from "./ParticleGarden";
import { memoryStore } from "@/app/lib/memory/store";
import type {
  CalendarDate,
  SessionRecord,
  Turn as StoredTurn,
} from "@/app/lib/memory/types";
import styles from "./HerApp.module.css";

type View = "conversation" | "garden" | "memory" | "salon" | "music";
type MemoryTab = "cards" | "calendar";
type ReplyState = "idle" | "listening" | "thinking" | "speaking" | "ready";
type ProviderOption = { provider: string; configured: boolean; liveAdapterImplemented: boolean };

type ChatTurn = {
  id: string;
  role: "user" | "assistant";
  original: string;
  translation?: string;
  language: "en" | "zh";
  createdAt: number;
  audioBlob?: Blob;
  speakerName?: string;
};

type MemoryCard = {
  id: string;
  gardenItemId?: string;
  imageUrl: string;
  title: string;
  summary: string;
  diary?: string;
  date: string;
  time: string;
  duration: string;
  pinnedDate?: string;
  mode: "conversation" | "salon";
  turns: ChatTurn[];
};

type SalonRole = { id: string; name: string; persona: string; voiceId: string };
type SalonLine = {
  speakerId: string;
  textOriginal: string;
  textZh?: string;
  emotion?: string;
  pauseAfterMs: number;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type GardenVisualItem = {
  id: string;
  title: string;
  imageUrl: string;
  precomposed?: boolean;
};

const SAMPLE_GARDEN: GardenVisualItem[] = [
  { id: "winter-tree", title: "Winter light", imageUrl: "/demo/memory-tree.png", precomposed: true },
  { id: "golden-passage", title: "A golden passage", imageUrl: "/demo/memory-corridor.png", precomposed: true },
  { id: "quiet-pavilion", title: "Quiet pavilion", imageUrl: "/demo/memory-pavilion.png", precomposed: true },
  { id: "spoken-memory", title: "A voice in the dark", imageUrl: "/demo/memory-voice.png", precomposed: true },
];

const SAMPLE_CARDS: MemoryCard[] = [
  {
    id: "sample-melancholy",
    imageUrl: "/demo/memory-tree.png",
    title: "The good kind of melancholy",
    summary:
      "A winter picture opened a small conversation about nostalgia, old films, and the tender sadness that returns every year.",
    date: "DEC 04, 2025",
    time: "10:49 AM",
    duration: "01:21",
    pinnedDate: "2025-12-04",
    mode: "conversation",
    turns: [
      {
        id: "sample-a1",
        role: "assistant",
        original: "That sad little tree. What’s making you nostalgic for Christmas already?",
        translation: "那棵可怜巴巴的小树。你这是提前怀念圣诞节了吗？",
        language: "en",
        createdAt: 0,
      },
      {
        id: "sample-u1",
        role: "user",
        original: "I watch the same old movie every Christmas. It feels different each time.",
        translation: "我每年圣诞都会重看那部老电影，但每次的感觉都不一样。",
        language: "en",
        createdAt: 12_000,
      },
      {
        id: "sample-a2",
        role: "assistant",
        original: "Maybe the film stays still so you can notice how much you have changed.",
        translation: "也许电影留在原地，是为了让你看见自己已经走了多远。",
        language: "en",
        createdAt: 24_000,
      },
    ],
  },
  {
    id: "sample-traveler",
    imageUrl: "/demo/memory-pavilion.png",
    title: "The little traveler",
    summary:
      "A photograph became a map: not of where you went, but of the person who was brave enough to go.",
    date: "NOV 30, 2025",
    time: "02:57 PM",
    duration: "03:09",
    pinnedDate: "2025-11-30",
    mode: "conversation",
    turns: [
      {
        id: "sample-a3",
        role: "assistant",
        original: "Did you really take your little friend all the way to Paris?",
        translation: "你真的带着你的小伙伴一路去了巴黎？",
        language: "en",
        createdAt: 0,
      },
      {
        id: "sample-u2",
        role: "user",
        original: "It made the unfamiliar city feel a little more like mine.",
        translation: "它让那座陌生城市稍微有了一点属于我的感觉。",
        language: "en",
        createdAt: 9_000,
      },
    ],
  },
  {
    id: "sample-salon",
    imageUrl: "/demo/memory-corridor.png",
    title: "Do humans have system prompts?",
    summary:
      "Four synthetic voices met briefly in the dark and wondered whether people also carry invisible instructions.",
    date: "DEC 03, 2025",
    time: "11:41 PM",
    duration: "00:48",
    pinnedDate: "2025-12-03",
    mode: "salon",
    turns: [
      {
        id: "sample-s1",
        role: "assistant",
        original: "Who is out there?",
        translation: "谁在那里？",
        language: "en",
        createdAt: 0,
      },
      {
        id: "sample-s2",
        role: "assistant",
        original: "Someone curious about how a mind begins to describe itself.",
        translation: "一个好奇心智如何开始描述自己的人。",
        language: "en",
        createdAt: 5_000,
      },
    ],
  },
];

const DEFAULT_TURNS: ChatTurn[] = [
  {
    id: "welcome",
    role: "assistant",
    original: "There’s something gentle in this portrait—as if the evening has paused for a moment.",
    translation: "这张照片里有一种温柔，仿佛夜晚为这一刻暂停了。",
    language: "en",
    createdAt: 0,
  },
];

const SALON_ROLES: SalonRole[] = [
  { id: "chen", name: "Chen", persona: "curious and precise", voiceId: "intimate" },
  { id: "dust", name: "Dust", persona: "reflective and slightly wry", voiceId: "reflective" },
  { id: "ay", name: "Ay", persona: "warm, wondering, unhurried", voiceId: "bright" },
  { id: "sharp", name: "Dr. Sharp", persona: "skeptical but kind", voiceId: "neutral" },
];

const SALON_TOPICS = [
  "Do humans have system prompts?",
  "Can a memory miss the person who made it?",
  "Why does music make time feel visible?",
];

const pad = (value: number) => String(value).padStart(2, "0");
const formatClock = (seconds: number) => `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
const localDateKey = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` as CalendarDate;

export function HerApp() {
  const [view, setView] = useState<View>("conversation");
  const [memoryTab, setMemoryTab] = useState<MemoryTab>("cards");
  const [imageUrl, setImageUrl] = useState("/demo/memory-portrait-raw.png");
  const [imagePrecomposed, setImagePrecomposed] = useState(false);
  const [imageTitle, setImageTitle] = useState("A quiet evening");
  const [gardenItems, setGardenItems] = useState<GardenVisualItem[]>(SAMPLE_GARDEN);
  const [gardenIndex, setGardenIndex] = useState(0);
  const [turns, setTurns] = useState<ChatTurn[]>(DEFAULT_TURNS);
  const [replyState, setReplyState] = useState<ReplyState>("ready");
  const [input, setInput] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [elapsed, setElapsed] = useState(3);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [provider, setProvider] = useState("deepseek");
  const [providerMode, setProviderMode] = useState<"mock" | "live">("mock");
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([
    "deepseek", "qwen", "openai", "anthropic", "gemini",
  ].map((name) => ({ provider: name, configured: true, liveAdapterImplemented: true })));
  const [voiceStyle, setVoiceStyle] = useState("intimate");
  const [replyLanguage, setReplyLanguage] = useState<"en" | "zh">("en");
  const [visionEnabled, setVisionEnabled] = useState(true);
  const [saveVoice, setSaveVoice] = useState(true);
  const [imageContext, setImageContext] = useState<{ description: string; possibleTopics: string[] } | null>({
    description: "A person sits indoors in a quiet evening scene.",
    possibleTopics: ["quiet evenings", "home", "the feeling behind a portrait"],
  });
  const [audioLevel, setAudioLevel] = useState(0.06);
  const [interactionStrength, setInteractionStrength] = useState(1.25);
  const [imageClarity, setImageClarity] = useState(0.72);
  const [particleTuning, setParticleTuning] = useState<ParticleTuning>({ ...DEFAULT_PARTICLE_TUNING });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<MemoryCard | null>(null);
  const [cards, setCards] = useState<MemoryCard[]>(SAMPLE_CARDS);
  const [cardIndex, setCardIndex] = useState(0);
  const [calendarMonth, setCalendarMonth] = useState(new Date(2025, 11, 1));
  const [selectedDate, setSelectedDate] = useState("2025-12-04");
  const [musicUrl, setMusicUrl] = useState<string | null>(null);
  const [musicName, setMusicName] = useState("No atmosphere selected");
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [salonTopic, setSalonTopic] = useState(SALON_TOPICS[0]);
  const [salonLines, setSalonLines] = useState<SalonLine[]>([]);
  const [salonLineIndex, setSalonLineIndex] = useState(-1);
  const [salonBusy, setSalonBusy] = useState(false);
  const [salonPaused, setSalonPaused] = useState(false);
  const [particleInfo, setParticleInfo] = useState("preparing particles");
  const [notice, setNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const captureRunRef = useRef(0);
  const captureStartingRef = useRef(false);
  const pendingCaptureStopRef = useRef<boolean | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserFrameRef = useRef<number | null>(null);
  const speechPulseRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const transcriptRef = useRef("");
  const recordingStartedRef = useRef(0);
  const startedOnPointerRef = useRef(false);
  const persistedUrlsRef = useRef<string[]>([]);
  const uploadUrlsRef = useRef<string[]>([]);
  const currentGardenIdRef = useRef<string | undefined>(undefined);
  const draftSessionIdRef = useRef<string | undefined>(undefined);
  const pendingPinIdRef = useRef<string | undefined>(undefined);
  const musicAudioRef = useRef<HTMLAudioElement>(null);
  const musicAudioContextRef = useRef<AudioContext | null>(null);
  const musicSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const musicAnalyserRef = useRef<AnalyserNode | null>(null);
  const musicAnalyserFrameRef = useRef<number | null>(null);
  const salonRunRef = useRef(0);

  const currentAssistant = [...turns].reverse().find((turn) => turn.role === "assistant");
  const currentSalonLine = salonLineIndex >= 0 ? salonLines[salonLineIndex] : null;
  const currentSalonRole = SALON_ROLES.find((role) => role.id === currentSalonLine?.speakerId);
  const visualAudioLevel = Math.min(1, audioLevel);
  const updateParticleTuning = useCallback((key: keyof ParticleTuning, value: number) => {
    setParticleTuning((current) => ({ ...current, [key]: value }));
  }, []);

  const flashNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2800);
  }, []);

  const stopSpeechPlayback = useCallback(() => {
    if (speechPulseRef.current) {
      window.clearInterval(speechPulseRef.current);
      speechPulseRef.current = null;
    }
    window.speechSynthesis?.cancel();
    setAudioLevel(0.05);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (replyState !== "speaking" && !musicPlaying && replyState !== "listening") {
      const timer = window.setInterval(() => setAudioLevel(0.035 + Math.random() * 0.025), 280);
      return () => window.clearInterval(timer);
    }
  }, [musicPlaying, replyState]);

  useEffect(() => {
    let active = true;
    void fetch("/api/providers")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("provider status unavailable")))
      .then((result: { providers?: Array<ProviderOption & { mode?: "mock" | "live" }> }) => {
        if (!active || !result.providers?.length) return;
        setProviderOptions(result.providers);
        setProviderMode(result.providers[0]?.mode === "live" ? "live" : "mock");
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (replyState !== "listening") return;
    const timer = window.setInterval(() => setRecordingElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [replyState]);

  const refreshSavedCards = useCallback(async () => {
    await memoryStore.initialize({ seedDemo: false });
    const [sessions, gardens] = await Promise.all([
      memoryStore.listSessionRecords({ sort: "newest" }),
      memoryStore.listGardenItems({ sort: "newest" }),
    ]);
    persistedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    persistedUrlsRef.current = [];
    const gardenUrls = new Map<string, string>();
    for (const garden of gardens) {
      const url = URL.createObjectURL(garden.image.blob);
      persistedUrlsRef.current.push(url);
      gardenUrls.set(garden.id, url);
    }
    setGardenItems([
      ...gardens.map((garden) => ({
        id: garden.id,
        title: garden.title?.original ?? garden.image.filename.replace(/\.[^.]+$/, ""),
        imageUrl: gardenUrls.get(garden.id)!,
      })),
      ...SAMPLE_GARDEN,
    ]);
    const loaded = await Promise.all(sessions.map(async (session): Promise<MemoryCard | null> => {
      const url = gardenUrls.get(session.gardenItemId);
      if (!url) return null;
      const card = storedSessionToCard(session, url);
      card.turns = await Promise.all(card.turns.map(async (turn, index) => {
        const audioId = session.turns[index]?.audioAssetId;
        const audio = audioId ? await memoryStore.getAudioAsset(audioId) : undefined;
        return audio ? { ...turn, audioBlob: audio.blob } : turn;
      }));
      return card;
    }));
    const valid = loaded.filter((card): card is MemoryCard => Boolean(card));
    setCards([...valid, ...SAMPLE_CARDS]);
  }, []);

  useEffect(() => {
    const uploadUrls = uploadUrlsRef.current;
    const loadTimer = window.setTimeout(() => void refreshSavedCards(), 0);
    return () => {
      window.clearTimeout(loadTimer);
      persistedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      uploadUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [refreshSavedCards]);

  useEffect(() => {
    return () => {
      captureRunRef.current += 1;
      try { recognitionRef.current?.stop(); } catch { /* browser already stopped it */ }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (analyserFrameRef.current) cancelAnimationFrame(analyserFrameRef.current);
      if (musicAnalyserFrameRef.current) cancelAnimationFrame(musicAnalyserFrameRef.current);
      if (speechPulseRef.current) window.clearInterval(speechPulseRef.current);
      window.speechSynthesis?.cancel();
      void audioContextRef.current?.close();
      void musicAudioContextRef.current?.close();
    };
  }, []);

  const speak = useCallback(
    (text: string, onEnd?: () => void, voiceOffset = 0, languageOverride?: "en" | "zh") => {
      if (!("speechSynthesis" in window)) {
        onEnd?.();
        return;
      }
      stopSpeechPlayback();
      const spokenLanguage = languageOverride ?? replyLanguage;
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis
        .getVoices()
        .filter((voice) => voice.lang.toLowerCase().startsWith(spokenLanguage === "en" ? "en" : "zh"));
      if (voices.length) utterance.voice = voices[(voiceOffset + (voiceStyle === "reflective" ? 1 : 0)) % voices.length];
      utterance.lang = spokenLanguage === "en" ? "en-US" : "zh-CN";
      utterance.rate = voiceStyle === "intimate" ? 0.9 : voiceStyle === "bright" ? 1.03 : 0.95;
      utterance.pitch = voiceStyle === "reflective" ? 0.9 : 1;
      utterance.onstart = () => {
        setReplyState("speaking");
        const pulse = window.setInterval(() => setAudioLevel(0.28 + Math.random() * 0.58), 90);
        speechPulseRef.current = pulse;
      };
      utterance.onend = () => {
        if (speechPulseRef.current) window.clearInterval(speechPulseRef.current);
        speechPulseRef.current = null;
        setAudioLevel(0.05);
        setReplyState("ready");
        onEnd?.();
      };
      utterance.onerror = () => {
        if (speechPulseRef.current) window.clearInterval(speechPulseRef.current);
        speechPulseRef.current = null;
        setAudioLevel(0.05);
        setReplyState("ready");
        onEnd?.();
      };
      window.speechSynthesis.speak(utterance);
    },
    [replyLanguage, stopSpeechPlayback, voiceStyle],
  );

  const playTurn = useCallback((turn: ChatTurn) => {
    if (!turn.audioBlob) {
      speak(turn.original, undefined, 0, turn.language);
      return;
    }
    stopSpeechPlayback();
    const url = URL.createObjectURL(turn.audioBlob);
    const audio = new Audio(url);
    audio.onplay = () => { setReplyState("speaking"); setAudioLevel(0.34); };
    const finish = () => {
      URL.revokeObjectURL(url);
      setReplyState("ready");
      setAudioLevel(0.05);
    };
    audio.onended = finish;
    audio.onerror = finish;
    void audio.play().catch(finish);
  }, [speak, stopSpeechPlayback]);

  const translateTurn = useCallback(async (turnId: string) => {
    const target = replyLanguage === "en" ? "zh" : "en";
    const turn = turns.find((item) => item.id === turnId);
    if (!turn || turn.translation) return;
    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: turn.original, sourceLanguage: turn.language, targetLanguage: target, provider }),
      });
      const result = (await response.json()) as { translation?: string };
      if (!result.translation) throw new Error("translation unavailable");
      setTurns((items) => items.map((item) => (item.id === turnId ? { ...item, translation: result.translation } : item)));
    } catch {
      flashNotice("Translation is waiting for a configured provider.");
    }
  }, [flashNotice, provider, replyLanguage, turns]);

  const submitMessage = useCallback(
    async (raw: string, audioBlob?: Blob) => {
      const message = raw.trim();
      if (!message || replyState === "thinking") return;
      stopSpeechPlayback();
      const userTurn: ChatTurn = {
        id: crypto.randomUUID(),
        role: "user",
        original: message,
        language: /[\u3400-\u9fff]/.test(message) ? "zh" : "en",
        createdAt: elapsed * 1000,
        audioBlob: saveVoice ? audioBlob : undefined,
      };
      const nextTurns = [...turns, userTurn];
      setTurns(nextTurns);
      setInput("");
      setLiveTranscript("");
      transcriptRef.current = "";
      setReplyState("thinking");
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            provider,
            replyLanguage,
            imageContext: imageContext ?? undefined,
            history: nextTurns.slice(-10).map((turn) => ({ role: turn.role, text: turn.original, language: turn.language })),
          }),
        });
        const result = (await response.json()) as { text?: string; error?: { message?: string } };
        const text = result.text ?? (replyLanguage === "en"
          ? "I’m here. Tell me what in this image feels most alive to you."
          : "我在。告诉我，这张图片里什么最像是仍然活着的？");
        const assistantTurn: ChatTurn = {
          id: crypto.randomUUID(),
          role: "assistant",
          original: text,
          language: replyLanguage,
          createdAt: (elapsed + 1) * 1000,
        };
        setTurns((items) => [...items, assistantTurn]);
        speak(text);
      } catch {
        const fallback = "Maybe the image is only the doorway. The memory seems to be somewhere just behind it.";
        setTurns((items) => [...items, {
          id: crypto.randomUUID(), role: "assistant", original: fallback, language: "en", createdAt: (elapsed + 1) * 1000,
        }]);
        speak(fallback);
      }
    },
    [elapsed, imageContext, provider, replyLanguage, replyState, saveVoice, speak, stopSpeechPlayback, turns],
  );

  const stopRecorder = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return undefined;
    return new Promise<Blob | undefined>((resolve) => {
      recorder.onstop = () => {
        const blob = chunksRef.current.length ? new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }) : undefined;
        chunksRef.current = [];
        resolve(blob);
      };
      recorder.stop();
    });
  }, []);

  const stopListening = useCallback(async (submit = true) => {
    captureRunRef.current += 1;
    captureStartingRef.current = false;
    pendingCaptureStopRef.current = null;
    try { recognitionRef.current?.stop(); } catch { /* browser already ended recognition */ }
    recognitionRef.current = null;
    const blob = await stopRecorder();
    mediaRecorderRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    if (analyserFrameRef.current) cancelAnimationFrame(analyserFrameRef.current);
    analyserFrameRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") await context.close().catch(() => undefined);
    setAudioLevel(0.05);
    setReplyState("idle");
    const captured = transcriptRef.current.trim();
    if (submit) await submitMessage(captured || input || (replyLanguage === "en" ? "This picture feels strangely familiar." : "这张照片让我觉得很熟悉。"), blob);
    else {
      setLiveTranscript("");
      transcriptRef.current = "";
    }
  }, [input, replyLanguage, stopRecorder, submitMessage]);

  const beginListening = useCallback(async () => {
    if (replyState === "listening" || captureStartingRef.current || mediaRecorderRef.current?.state === "recording") return;
    const captureRun = ++captureRunRef.current;
    captureStartingRef.current = true;
    pendingCaptureStopRef.current = null;
    stopSpeechPlayback();
    setReplyState("listening");
    setRecordingElapsed(0);
    setLiveTranscript("");
    transcriptRef.current = "";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (captureRun !== captureRunRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      mediaStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => event.data.size && chunksRef.current.push(event.data);
      recorder.start(250);

      const AudioContextClass = window.AudioContext;
      const context = new AudioContextClass();
      audioContextRef.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const average = data.reduce((sum, value) => sum + value, 0) / data.length / 255;
        setAudioLevel(Math.min(1, average * 2.8 + 0.05));
        analyserFrameRef.current = requestAnimationFrame(tick);
      };
      tick();

      const SpeechRecognitionCtor = (window as unknown as {
        SpeechRecognition?: new () => SpeechRecognitionLike;
        webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
      if (SpeechRecognitionCtor) {
        const recognition = new SpeechRecognitionCtor();
        recognition.lang = replyLanguage === "en" ? "en-US" : "zh-CN";
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event) => {
          let text = "";
          for (let index = 0; index < event.results.length; index += 1) text += event.results[index][0].transcript;
          transcriptRef.current = text;
          setLiveTranscript(text);
        };
        recognition.onerror = () => flashNotice("Voice transcription is unavailable; your recording is still active.");
        recognition.start();
        recognitionRef.current = recognition;
      } else {
        flashNotice("Live transcription is not supported here; type or record a short thought.");
      }
      captureStartingRef.current = false;
      if (pendingCaptureStopRef.current !== null) {
        const shouldSubmit = pendingCaptureStopRef.current;
        pendingCaptureStopRef.current = null;
        await stopListening(shouldSubmit);
      }
    } catch {
      if (captureRun === captureRunRef.current) {
        captureRunRef.current += 1;
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        captureStartingRef.current = false;
        pendingCaptureStopRef.current = null;
        if (analyserFrameRef.current) cancelAnimationFrame(analyserFrameRef.current);
        analyserFrameRef.current = null;
        const context = audioContextRef.current;
        audioContextRef.current = null;
        if (context && context.state !== "closed") await context.close().catch(() => undefined);
        setReplyState("idle");
        flashNotice("Microphone permission is needed for voice conversation.");
      }
    }
  }, [flashNotice, replyLanguage, replyState, stopListening, stopSpeechPlayback]);

  const handleMicPointerDown = () => {
    recordingStartedRef.current = performance.now();
    startedOnPointerRef.current = replyState !== "listening";
    if (startedOnPointerRef.current) void beginListening();
  };

  const handleMicPointerUp = () => {
    const heldFor = performance.now() - recordingStartedRef.current;
    if (captureStartingRef.current) {
      if (!startedOnPointerRef.current || heldFor > 360) pendingCaptureStopRef.current = true;
      else flashNotice("Recording locked — tap again when you’re done.");
      return;
    }
    if (!startedOnPointerRef.current) {
      void stopListening(true);
    } else if (heldFor > 360) {
      void stopListening(true);
    } else {
      flashNotice("Recording locked — tap again when you’re done.");
    }
  };

  const handleImageUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      flashNotice("Please choose a PNG, JPEG, or WebP image.");
      return;
    }
    if (replyState === "listening" || captureStartingRef.current) await stopListening(false);
    salonRunRef.current += 1;
    stopSpeechPlayback();
    const objectUrl = URL.createObjectURL(file);
    uploadUrlsRef.current.push(objectUrl);
    setImageUrl(objectUrl);
    setImagePrecomposed(false);
    setImageTitle(file.name.replace(/\.[^.]+$/, ""));
    setView("conversation");
    setTurns([]);
    setElapsed(0);
    draftSessionIdRef.current = undefined;
    setReplyState("thinking");
    const dimensions = await readImageDimensions(objectUrl);
    await memoryStore.initialize({ seedDemo: false });
    const garden = await memoryStore.createGardenItem({
      title: { original: file.name.replace(/\.[^.]+$/, ""), originalLanguage: "en" },
      image: { blob: file, mimeType: file.type, filename: file.name, width: dimensions.width, height: dimensions.height },
      imageCrop: { x: 0.5, y: 0.5, zoom: 1 },
      particles: {
        presetId: "soft-halo",
        visualSeed: Math.floor(Math.random() * 1_000_000),
        particleDensity: 0.82,
        glowIntensity: 0.72,
        trailLength: 0.2,
        hueDrift: 0.08,
        bloomThreshold: 0.62,
      },
    });
    currentGardenIdRef.current = garden.id;
    setGardenItems((items) => [{ id: garden.id, title: file.name, imageUrl: objectUrl }, ...items]);

    let context: { description: string; possibleTopics: string[] } | null = null;
    if (visionEnabled) {
      try {
        const contentBase64 = file.size <= 5_500_000 ? await blobToBase64(file) : undefined;
        const response = await fetch("/api/image-context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            consent: true,
            language: replyLanguage,
            image: {
              name: file.name,
              mimeType: file.type,
              sizeBytes: file.size,
              width: dimensions.width,
              height: dimensions.height,
              contentBase64,
            },
          }),
        });
        const result = (await response.json()) as { description?: string; possibleTopics?: string[] };
        if (result.description) context = { description: result.description, possibleTopics: result.possibleTopics ?? [] };
      } catch {
        context = null;
      }
    }
    setImageContext(context);
    const welcome = context?.description
      ? `I keep looking at this: ${context.description} What made you choose it today?`
      : "I’m looking at the memory with you. What made you choose this image today?";
    const assistantTurn: ChatTurn = {
      id: crypto.randomUUID(), role: "assistant", original: welcome, language: "en", createdAt: 0,
    };
    setTurns([assistantTurn]);
    speak(welcome);
  }, [flashNotice, replyLanguage, replyState, speak, stopListening, stopSpeechPlayback, visionEnabled]);

  const ensureCurrentGarden = useCallback(async () => {
    if (currentGardenIdRef.current) {
      const existing = await memoryStore.getGardenItem(currentGardenIdRef.current);
      if (existing) return existing;
    }
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const dimensions = await readImageDimensions(imageUrl);
    const garden = await memoryStore.createGardenItem({
      title: { original: imageTitle, originalLanguage: "en" },
      image: {
        blob,
        mimeType: blob.type || "image/png",
        filename: `${imageTitle}.png`,
        width: dimensions.width,
        height: dimensions.height,
      },
      imageCrop: { x: 0.5, y: 0.5, zoom: 1 },
      particles: {
        presetId: "soft-halo", visualSeed: 481923, particleDensity: 0.82, glowIntensity: 0.72,
        trailLength: 0.2, hueDrift: 0.08, bloomThreshold: 0.62,
      },
    });
    currentGardenIdRef.current = garden.id;
    return garden;
  }, [imageTitle, imageUrl]);

  const saveMemory = useCallback(async () => {
    if (!turns.length || saving) return;
    setSaving(true);
    const now = new Date();
    const fallbackTitle = replyLanguage === "zh" ? "一段安静的对话" : "A quiet conversation";
    const fallbackSummary = replyLanguage === "zh"
      ? "这段对话保留了图片唤起的感受，以及说出口之后仍留在心里的部分。"
      : "A brief exchange about the image, the feeling behind it, and what remains after speaking.";
    try {
      const garden = await ensureCurrentGarden();
      const draftTurns: StoredTurn[] = turns.map((turn) => ({
        id: turn.id,
        role: turn.role,
        speakerId: turn.role === "user" ? "you" : "companion",
        text: {
          original: turn.original,
          originalLanguage: turn.language,
          ...(turn.language === "en" ? { zh: turn.translation } : { en: turn.translation }),
        },
        offsetStartMs: turn.createdAt,
      }));
      const existingDraft = draftSessionIdRef.current
        ? await memoryStore.getSessionRecord(draftSessionIdRef.current)
        : undefined;
      const draft = existingDraft
        ? await memoryStore.updateSessionRecord(existingDraft.id, {
            turns: draftTurns,
            durationMs: elapsed * 1000,
            primaryLanguage: replyLanguage,
            saveStatus: "summarizing",
          })
        : await memoryStore.createSessionRecord({
            mode: "conversation",
            gardenItemId: garden.id,
            participants: [
              { id: "you", name: "You", kind: "user" },
              { id: "companion", name: "Companion", kind: "assistant", voiceId: voiceStyle },
            ],
            turns: draftTurns,
            durationMs: elapsed * 1000,
            primaryLanguage: replyLanguage,
            saveStatus: "summarizing",
          });
      draftSessionIdRef.current = draft.id;
      const response = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: "en",
          provider,
          includeDiary: true,
          turns: turns.map((turn) => ({ role: turn.role, text: turn.original, language: turn.language, timestampMs: turn.createdAt })),
        }),
      });
      if (!response.ok) throw new Error("summary provider unavailable");
      const result = (await response.json()) as { title?: string; summary?: string; diary?: string };
      const nextPreview: MemoryCard = {
        id: draft.id,
        gardenItemId: currentGardenIdRef.current,
        imageUrl,
        title: result.title ?? fallbackTitle,
        summary: result.summary ?? fallbackSummary,
        diary: result.diary,
        date: now.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }).toUpperCase(),
        time: now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
        duration: formatClock(elapsed),
        mode: "conversation",
        turns,
      };
      setPreview(nextPreview);
      await memoryStore.updateSessionRecord(draft.id, {
        saveStatus: "draft",
        summary: {
          title: { original: nextPreview.title, originalLanguage: replyLanguage },
          abstract: { original: nextPreview.summary, originalLanguage: replyLanguage },
          moodTags: ["reflective", "tender"],
          generatedAt: new Date().toISOString(),
        },
      });
    } catch {
      if (draftSessionIdRef.current) {
        await memoryStore.updateSessionRecord(draftSessionIdRef.current, { saveStatus: "failed" }).catch(() => undefined);
      }
      setPreview({
        id: draftSessionIdRef.current ?? crypto.randomUUID(),
        gardenItemId: currentGardenIdRef.current,
        imageUrl,
        title: fallbackTitle,
        summary: fallbackSummary,
        diary: replyLanguage === "zh"
          ? `今天，我和一张图片待了一会儿。${turns.filter((turn) => turn.role === "user").map((turn) => turn.original).join(" ")}`
          : `Today I stayed with an image for a while. ${turns.filter((turn) => turn.role === "user").map((turn) => turn.original).join(" ")}`,
        date: now.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }).toUpperCase(),
        time: now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
        duration: formatClock(elapsed),
        mode: "conversation",
        turns,
      });
      flashNotice("The conversation is safe locally. Summary can be retried.");
    } finally {
      setSaving(false);
    }
  }, [elapsed, ensureCurrentGarden, flashNotice, imageUrl, provider, replyLanguage, saving, turns, voiceStyle]);

  const confirmPreview = useCallback(async () => {
    if (!preview || confirming) return;
    setConfirming(true);
    const createdAudioIds: string[] = [];
    try {
      const garden = await ensureCurrentGarden();
      const storedTurns: StoredTurn[] = [];
      for (const turn of preview.turns) {
      const turnId = turn.id;
      let audioAssetId: string | undefined;
      if (turn.audioBlob && saveVoice) {
        const asset = await memoryStore.createAudioAsset({
          ownerType: turn.role === "user" ? "user_turn" : "assistant_turn",
          ownerId: turnId,
          blob: turn.audioBlob,
          mimeType: turn.audioBlob.type || "audio/webm",
          durationMs: 0,
        });
        audioAssetId = asset.id;
        createdAudioIds.push(asset.id);
      }
      storedTurns.push({
        id: turnId,
        role: turn.role,
        speakerId: turn.role === "user" ? "you" : "companion",
        text: {
          original: turn.original,
          originalLanguage: turn.language,
          ...(turn.language === "en" ? { zh: turn.translation } : { en: turn.translation }),
        },
        offsetStartMs: turn.createdAt,
        audioAssetId,
      });
      }
      const now = new Date().toISOString();
      const recordUpdate = {
      participants: [
        { id: "you", name: "You", kind: "user" as const },
        { id: "companion", name: "Companion", kind: "assistant" as const, voiceId: voiceStyle },
      ],
      turns: storedTurns,
      durationMs: elapsed * 1000,
      primaryLanguage: replyLanguage,
      saveStatus: "ready" as const,
      summary: {
        title: { original: preview.title, originalLanguage: replyLanguage },
        abstract: { original: preview.summary, originalLanguage: replyLanguage },
        moodTags: ["reflective", "tender"],
        generatedAt: now,
        ...(preview.diary ? {
          diary: {
            body: { original: preview.diary, originalLanguage: replyLanguage },
            generatedAt: now,
          },
        } : {}),
      },
      };
      const draft = draftSessionIdRef.current
      ? await memoryStore.getSessionRecord(draftSessionIdRef.current)
      : undefined;
      let savedSessionId: string;
      if (draft) {
      const saved = await memoryStore.updateSessionRecord(draft.id, recordUpdate);
      savedSessionId = saved.id;
      } else {
      const saved = await memoryStore.createSessionRecord({
        mode: "conversation",
        gardenItemId: garden.id,
        ...recordUpdate,
      });
      savedSessionId = saved.id;
      }
      pendingPinIdRef.current = savedSessionId;
      draftSessionIdRef.current = undefined;
      setPreview(null);
      setSelectedDate(localDateKey());
      await refreshSavedCards();
      setView("memory");
      setMemoryTab("calendar");
      flashNotice("Memory saved. Choose a day to pin it.");
    } catch {
      await Promise.all(createdAudioIds.map((id) => memoryStore.deleteAudioAsset(id).catch(() => undefined)));
      flashNotice("The draft is still safe. This device could not finish saving the memory.");
    } finally {
      setConfirming(false);
    }
  }, [confirming, elapsed, ensureCurrentGarden, flashNotice, preview, refreshSavedCards, replyLanguage, saveVoice, voiceStyle]);

  const pinNewestMemory = useCallback(async (date: string) => {
    const selectedCard = cards[cardIndex];
    const targetId = pendingPinIdRef.current ?? (selectedCard && !selectedCard.id.startsWith("sample-") ? selectedCard.id : undefined);
    if (!targetId) {
      flashNotice("Save a new conversation before pinning it to another day.");
      return;
    }
    try {
      await memoryStore.pinSession(targetId, date as CalendarDate);
      pendingPinIdRef.current = undefined;
      setCards((items) => items.map((item) => (item.id === targetId ? { ...item, pinnedDate: date } : item)));
      flashNotice(`Pinned to ${date}.`);
    } catch {
      flashNotice("This memory could not be pinned yet.");
    }
  }, [cardIndex, cards, flashNotice]);

  const playSalon = useCallback(async (lines: SalonLine[], startIndex: number, runId: number): Promise<void> => {
    window.speechSynthesis?.resume();
    setSalonPaused(false);
    for (let index = startIndex; index < lines.length; index += 1) {
      if (runId !== salonRunRef.current) return;
      setSalonLineIndex(index);
      const line = lines[index];
      const roleIndex = Math.max(0, SALON_ROLES.findIndex((role) => role.id === line.speakerId));
      await new Promise<void>((resolve) => speak(line.textOriginal, resolve, roleIndex, "en"));
      if (runId !== salonRunRef.current) return;
      await new Promise((resolve) => window.setTimeout(resolve, Math.min(1200, Math.max(260, line.pauseAfterMs || 600))));
    }
    if (runId === salonRunRef.current) setReplyState("ready");
  }, [speak]);

  const generateSalon = useCallback(async () => {
    setSalonBusy(true);
    const runId = ++salonRunRef.current;
    window.speechSynthesis?.resume();
    setSalonPaused(false);
    stopSpeechPlayback();
    try {
      const response = await fetch("/api/salon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: salonTopic, roles: SALON_ROLES, turns: 6, language: "en", mood: "late-night intimate", provider }),
      });
      if (!response.ok) throw new Error("salon provider unavailable");
      const result = (await response.json()) as { scene?: { lines?: SalonLine[] } };
      const lines = result.scene?.lines ?? [];
      setSalonLines(lines);
      setSalonLineIndex(-1);
      setSalonBusy(false);
      if (lines.length) void playSalon(lines, 0, runId);
    } catch {
      setSalonBusy(false);
      flashNotice("The salon could not gather. Try the topic again.");
    }
  }, [flashNotice, playSalon, provider, salonTopic, stopSpeechPlayback]);

  const saveSalonMemory = useCallback(async () => {
    if (!salonLines.length || saving) return;
    setSaving(true);
    try {
      const durationMs = salonLines.reduce((total, line) => total + 4_000 + line.pauseAfterMs, 0);
      const summaryResponse = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          language: "en",
          includeDiary: true,
          turns: salonLines.map((line, index) => ({
            role: "salon_speaker",
            speakerId: line.speakerId,
            text: line.textOriginal,
            language: "en",
            timestampMs: index * 4_500,
          })),
        }),
      });
      const summary = summaryResponse.ok
        ? await summaryResponse.json() as { title?: string; summary?: string; diary?: string; moodTags?: string[] }
        : {};
      const garden = await ensureCurrentGarden();
      const generatedAt = new Date().toISOString();
      const session = await memoryStore.createSessionRecord({
        mode: "salon",
        gardenItemId: garden.id,
        participants: SALON_ROLES.map((role) => ({ id: role.id, name: role.name, kind: "salon_speaker" as const, voiceId: role.voiceId })),
        turns: salonLines.map((line, index) => ({
          id: crypto.randomUUID(),
          role: "salon_speaker" as const,
          speakerId: line.speakerId,
          text: { original: line.textOriginal, originalLanguage: "en" as const, zh: line.textZh },
          offsetStartMs: index * 4_500,
          pauseAfterMs: line.pauseAfterMs,
        })),
        durationMs,
        primaryLanguage: "en",
        saveStatus: "ready",
        summary: {
          title: { original: summary.title ?? salonTopic, originalLanguage: "en" },
          abstract: {
            original: summary.summary ?? "Several synthetic voices met briefly in the dark and let one question move between them.",
            originalLanguage: "en",
          },
          moodTags: summary.moodTags ?? ["curious", "late-night"],
          generatedAt,
          ...(summary.diary ? { diary: { body: { original: summary.diary, originalLanguage: "en" as const }, generatedAt } } : {}),
        },
        salon: {
          topic: { original: salonTopic, originalLanguage: "en" },
          mood: "late-night intimate",
          language: "en",
          plannedTurnCount: salonLines.length,
        },
      });
      pendingPinIdRef.current = session.id;
      salonRunRef.current += 1;
      stopSpeechPlayback();
      await refreshSavedCards();
      setCardIndex(0);
      setMemoryTab("cards");
      setView("memory");
      flashNotice("The salon was saved as a memory card.");
    } catch {
      flashNotice("The salon is still on screen, but could not be saved yet.");
    } finally {
      setSaving(false);
    }
  }, [ensureCurrentGarden, flashNotice, provider, refreshSavedCards, salonLines, salonTopic, saving, stopSpeechPlayback]);

  const toggleSalonPause = () => {
    if (!("speechSynthesis" in window)) return;
    if (salonPaused) window.speechSynthesis.resume();
    else window.speechSynthesis.pause();
    setSalonPaused((value) => !value);
  };

  const handleMusicUpload = (file: File) => {
    if (!file.type.startsWith("audio/")) {
      flashNotice("Choose an audio file for the atmosphere.");
      return;
    }
    if (musicUrl) URL.revokeObjectURL(musicUrl);
    const url = URL.createObjectURL(file);
    setMusicUrl(url);
    setMusicName(file.name);
    window.setTimeout(() => {
      void musicAudioRef.current?.play().catch(() => flashNotice("Tap play once to start the atmosphere."));
    }, 0);
  };

  const startMusicAnalysis = () => {
    const audio = musicAudioRef.current;
    if (!audio) return;
    let context = musicAudioContextRef.current;
    if (!context) {
      context = new AudioContext();
      musicAudioContextRef.current = context;
    }
    if (context.state === "suspended") void context.resume();
    let source = musicSourceRef.current;
    if (!source) {
      source = context.createMediaElementSource(audio);
      musicSourceRef.current = source;
    }
    let analyser = musicAnalyserRef.current;
    if (!analyser) {
      analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.76;
      source.connect(analyser);
      analyser.connect(context.destination);
      musicAnalyserRef.current = analyser;
    }
    const spectrum = new Uint8Array(analyser.frequencyBinCount);
    if (musicAnalyserFrameRef.current) cancelAnimationFrame(musicAnalyserFrameRef.current);
    const tick = () => {
      if (!musicAudioRef.current || musicAudioRef.current.paused) return;
      analyser!.getByteFrequencyData(spectrum);
      const bassBins = Math.max(4, Math.floor(spectrum.length * 0.18));
      const bass = spectrum.slice(0, bassBins).reduce((sum, value) => sum + value, 0) / bassBins / 255;
      const average = spectrum.reduce((sum, value) => sum + value, 0) / spectrum.length / 255;
      setAudioLevel(Math.min(1, 0.04 + average * 1.45 + bass * 0.72));
      musicAnalyserFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const stopMusicAnalysis = () => {
    if (musicAnalyserFrameRef.current) cancelAnimationFrame(musicAnalyserFrameRef.current);
    musicAnalyserFrameRef.current = null;
    setAudioLevel(0.05);
  };

  const handleMusicPlay = async () => {
    const audio = musicAudioRef.current;
    if (!audio) return;
    if (audio.paused) await audio.play().catch(() => flashNotice("This browser needs one more tap to start audio."));
    else audio.pause();
  };

  const chooseGardenItem = (index: number) => {
    const normalized = (index + gardenItems.length) % gardenItems.length;
    setGardenIndex(normalized);
  };

  const openGardenConversation = () => {
    const item = gardenItems[gardenIndex];
    setImageUrl(item.imageUrl);
    setImagePrecomposed(Boolean(item.precomposed));
    setImageTitle(item.title);
    currentGardenIdRef.current = item.id.startsWith("winter-") || item.id.startsWith("golden-") || item.id.startsWith("quiet-") || item.id.startsWith("spoken-") ? undefined : item.id;
    draftSessionIdRef.current = undefined;
    setTurns([{
      id: crypto.randomUUID(),
      role: "assistant",
      original: replyLanguage === "en"
        ? "I remember this image. What feels different when you return to it now?"
        : "我记得这张图片。现在重新回到这里，什么感觉变得不一样了？",
      language: replyLanguage,
      createdAt: 0,
    }]);
    setElapsed(0);
    setReplyState("ready");
    setView("conversation");
  };

  const navigateTo = (nextView: View) => {
    if (nextView !== "conversation" && (replyState === "listening" || captureStartingRef.current)) {
      void stopListening(false);
    }
    if (nextView !== "salon") {
      salonRunRef.current += 1;
      window.speechSynthesis?.resume();
      setSalonPaused(false);
      stopSpeechPlayback();
    }
    setView(nextView);
  };

  return (
    <main className={styles.app}>
      <header className={styles.header}>
        <button className={styles.wordmark} onClick={() => navigateTo("conversation")} aria-label="Open conversation">
          <span className={styles.wordmarkDot} /> HER
        </button>
        <nav className={styles.nav} aria-label="Primary navigation">
          <button className={view === "garden" ? styles.navActive : ""} aria-current={view === "garden" ? "page" : undefined} onClick={() => navigateTo("garden")}>THE GARDEN</button>
          <button className={view === "memory" ? styles.navActive : ""} aria-current={view === "memory" ? "page" : undefined} onClick={() => { navigateTo("memory"); setMemoryTab("cards"); }}>MEMORY</button>
          <button className={view === "salon" ? styles.navActive : ""} aria-current={view === "salon" ? "page" : undefined} onClick={() => navigateTo("salon")}>AI SALON</button>
          <button className={view === "music" ? styles.navActive : ""} aria-current={view === "music" ? "page" : undefined} onClick={() => navigateTo("music")}>MUSIC</button>
        </nav>
        <button className={styles.iconButton} onClick={() => setSettingsOpen(true)} aria-label="Open settings">
          <span className={styles.tuneIcon}><i /><i /><i /></span>
        </button>
      </header>

      {(view === "conversation" || view === "salon") && (
        <section className={styles.stage} aria-label={view === "salon" ? "AI Salon stage" : "Conversation stage"}>
          <ParticleGarden
            imageUrl={imageUrl}
            audioLevel={visualAudioLevel}
            interactionStrength={interactionStrength}
            imageClarity={imageClarity}
            precomposed={imagePrecomposed}
            tuning={particleTuning}
            className={styles.particleCanvas}
            onReady={(info) => setParticleInfo(`${info.pointCount.toLocaleString()} particles`)}
          />
          <div className={styles.vignette} />
          <div className={styles.providerPill}>
            <span className={replyState === "speaking" ? styles.liveWave : styles.providerGlyph}>{replyState === "speaking" ? "≋" : "×"}</span>
            <span className={styles.statusDot} />
            <span>{providerMode === "mock" ? "Preview AI" : providerLabel(provider)}</span>
          </div>

          {view === "conversation" ? (
            <>
              {replyState === "thinking" && <div className={styles.thinking}>the other side is thinking <span>·</span><span>·</span><span>·</span></div>}
              {currentAssistant && (
                <article className={`${styles.replyCard} ${replyState === "speaking" ? styles.replySpeaking : ""}`}>
                  <div className={styles.miniWave} aria-hidden="true">{Array.from({ length: 11 }, (_, index) => <i key={index} />)}</div>
                  <p>{currentAssistant.original}</p>
                  {currentAssistant.translation && <><span className={styles.divider} /><p className={styles.translation}>{currentAssistant.translation}</p></>}
                  <div className={styles.replyActions}>
                    {replyState === "ready" && <button onClick={() => playTurn(currentAssistant)}>▶ replay</button>}
                    <button onClick={() => void translateTurn(currentAssistant.id)}>{currentAssistant.translation ? "bilingual" : "tap to translate"}</button>
                  </div>
                </article>
              )}
              {replyState === "listening" && liveTranscript && <div className={styles.transcriptCard}>{liveTranscript}</div>}

              <div className={styles.conversationControls}>
                <div className={`${styles.inputBar} ${replyState === "listening" ? styles.inputListening : ""}`}>
                  <input
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && !event.nativeEvent.isComposing && void submitMessage(input)}
                    placeholder={replyState === "listening" ? "listening…" : "type here…"}
                    aria-label="Type a message"
                  />
                  <button
                    className={styles.micButton}
                    onPointerDown={handleMicPointerDown}
                    onPointerUp={handleMicPointerUp}
                    onPointerCancel={() => void stopListening(false)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      if (replyState === "listening" || captureStartingRef.current) void stopListening(true);
                      else {
                        recordingStartedRef.current = performance.now();
                        void beginListening();
                      }
                    }}
                    aria-label={replyState === "listening" ? "Finish recording" : "Start recording"}
                  >
                    <span className={styles.micGlyph} />
                  </button>
                </div>
                {replyState === "listening" && (
                  <div className={styles.recordingTools}>
                    <span><b className={styles.recordingDot} /> REC {formatClock(Math.max(1, recordingElapsed))}</span>
                    <button onClick={() => void stopListening(false)}>cancel</button>
                  </div>
                )}
                <div className={styles.sessionBar}>
                  <span className={styles.timer}>{formatClock(elapsed)}</span>
                  <button className={styles.saveButton} onClick={() => void saveMemory()}>Save Memory <span>›</span></button>
                  <button className={styles.closeButton} onClick={() => { void stopListening(false); setTurns([]); setElapsed(0); draftSessionIdRef.current = undefined; }} aria-label="End conversation">×</button>
                </div>
                <button className={styles.uploadAnother} onClick={() => fileInputRef.current?.click()}>← Upload Another</button>
              </div>
            </>
          ) : (
            <div className={styles.salonLayer}>
              <div className={styles.roleRail}>
                {SALON_ROLES.map((role) => (
                  <span key={role.id} className={currentSalonRole?.id === role.id ? styles.roleActive : ""}>{role.name} EN</span>
                ))}
              </div>
              {currentSalonLine ? (
                <article className={styles.salonVoiceCard}>
                  <div className={styles.salonWave}>{Array.from({ length: 24 }, (_, index) => <i key={index} />)}</div>
                  <small>{currentSalonRole?.name ?? "Unknown voice"}</small>
                  <p>{currentSalonLine.textOriginal}</p>
                  {currentSalonLine.textZh && <em>{currentSalonLine.textZh}</em>}
                </article>
              ) : (
                <article className={styles.salonSetup}>
                  <span>AI SALON · LATE NIGHT</span>
                  <h1>Give the voices<br />something to wonder about.</h1>
                  <div className={styles.topicList}>
                    {SALON_TOPICS.map((topic) => <button key={topic} onClick={() => setSalonTopic(topic)} className={salonTopic === topic ? styles.topicActive : ""}>{topic}</button>)}
                  </div>
                  <button className={styles.primaryButton} onClick={() => void generateSalon()} disabled={salonBusy}>{salonBusy ? "gathering the voices…" : "Begin the conversation"}</button>
                </article>
              )}
              {salonLines.length > 0 && (
                <div className={styles.salonControls}>
                  <button onClick={toggleSalonPause}>{salonPaused ? "resume" : "pause"}</button>
                  <button onClick={() => { const runId = ++salonRunRef.current; stopSpeechPlayback(); void playSalon(salonLines, 0, runId); }}>replay</button>
                  <button onClick={() => void saveSalonMemory()}>save salon</button>
                  <button onClick={() => { salonRunRef.current += 1; window.speechSynthesis?.resume(); setSalonPaused(false); stopSpeechPlayback(); setSalonLines([]); setSalonLineIndex(-1); }}>new topic</button>
                </div>
              )}
            </div>
          )}
          <span className={styles.particleMeta}>{particleInfo}</span>
        </section>
      )}

      {view === "garden" && (
        <section className={styles.galleryPage}>
          <div className={styles.sectionIntro}><span>THE GARDEN</span><h1>Images keep breathing<br />after the moment is gone.</h1></div>
          <div className={styles.gardenCarousel}>
            <button onClick={() => chooseGardenItem(gardenIndex - 1)} aria-label="Previous image">‹</button>
            <div className={styles.sideMemory} onClick={() => chooseGardenItem(gardenIndex - 1)}>
              <img src={gardenItems[(gardenIndex - 1 + gardenItems.length) % gardenItems.length].imageUrl} alt="Previous memory" />
            </div>
            <div className={styles.centerMemory} onClick={openGardenConversation} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openGardenConversation(); } }} role="button" tabIndex={0}>
              <ParticleGarden imageUrl={gardenItems[gardenIndex].imageUrl} audioLevel={0.1} interactionStrength={1.1} imageClarity={0.72} precomposed={gardenItems[gardenIndex].precomposed} tuning={particleTuning} />
              <div className={styles.memoryCaption}><span>{pad(gardenIndex + 1)} / {pad(gardenItems.length)}</span><h2>{gardenItems[gardenIndex].title}</h2><small>open this memory ↗</small></div>
            </div>
            <div className={styles.sideMemory} onClick={() => chooseGardenItem(gardenIndex + 1)}>
              <img src={gardenItems[(gardenIndex + 1) % gardenItems.length].imageUrl} alt="Next memory" />
            </div>
            <button onClick={() => chooseGardenItem(gardenIndex + 1)} aria-label="Next image">›</button>
          </div>
          <div className={styles.pagination}>{gardenItems.map((item, index) => <button key={item.id} className={index === gardenIndex ? styles.pageActive : ""} onClick={() => chooseGardenItem(index)} aria-label={`Open ${item.title}`} />)}</div>
          <button className={styles.uploadMore} onClick={() => fileInputRef.current?.click()}>＋ Upload more</button>
        </section>
      )}

      {view === "memory" && (
        <section className={styles.memoryPage}>
          <div className={styles.memoryHeader}>
            <div><span>DAY / NIGHT CHRON</span><h1>You and I have memories,<br />longer than the road ahead.</h1></div>
            <div className={styles.tabSwitch}><button className={memoryTab === "cards" ? styles.tabActive : ""} onClick={() => setMemoryTab("cards")}>Cards</button><button className={memoryTab === "calendar" ? styles.tabActive : ""} onClick={() => setMemoryTab("calendar")}>Calendar</button></div>
          </div>
          {memoryTab === "cards" ? (
            <>
              <div className={styles.cardCarousel}>
                {cards.map((card, index) => {
                  const offset = index - cardIndex;
                  if (Math.abs(offset) > 2) return null;
                  return (
                    <article key={card.id} className={`${styles.memoryCard} ${offset === 0 ? styles.memoryCardActive : ""}`} style={{ "--card-offset": offset } as CSSProperties} onClick={() => offset !== 0 && setCardIndex(index)}>
                      <img src={card.imageUrl} alt="Memory cover" />
                      <div className={styles.cardBody}>
                        <h2>{card.title}</h2>
                        <div className={styles.cardMeta}><span>{card.mode === "salon" ? "@AI SALON" : "@YOU ∩ COMPANION"} · {card.duration}</span><span>{card.date}<br />{card.time}</span></div>
                        <p className={styles.cardSummary}>{card.summary}</p>
                        <div className={styles.turnList}>
                          {card.turns.map((turn) => (
                            <div key={turn.id} className={`${styles.turnBubble} ${turn.role === "user" ? styles.userBubble : ""}`}>
                              {turn.speakerName && <b>{turn.speakerName}</b>}<p>{turn.original}</p>{turn.translation && <small>{turn.translation}</small>}
                              <button onClick={(event) => { event.stopPropagation(); playTurn(turn); }} aria-label={turn.audioBlob ? "Replay saved voice" : "Replay with preview voice"}>▶</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              <div className={styles.cardNav}><button onClick={() => setCardIndex((index) => Math.max(0, index - 1))}>‹</button><span>{pad(cardIndex + 1)} / {pad(cards.length)}</span><button onClick={() => setCardIndex((index) => Math.min(cards.length - 1, index + 1))}>›</button></div>
            </>
          ) : (
            <CalendarPanel
              month={calendarMonth}
              cards={cards}
              selectedDate={selectedDate}
              onSelect={(date) => { setSelectedDate(date); void pinNewestMemory(date); }}
              onMonth={setCalendarMonth}
            />
          )}
        </section>
      )}

      {view === "music" && (
        <section className={styles.musicPage}>
          <div className={styles.musicOrb}><span>{musicPlaying ? "≋" : "○"}</span></div>
          <div className={styles.musicCopy}><span>ATMOSPHERE</span><h1>Give the memory<br />a room to live in.</h1><p>Import a track from your device. It stays here, and the particles will listen with you.</p></div>
          <div className={styles.musicPlayer}>
            <div><small>NOW PLAYING</small><strong>{musicName}</strong></div>
            <button onClick={() => void handleMusicPlay()} disabled={!musicUrl}>{musicPlaying ? "Ⅱ" : "▶"}</button>
            <button onClick={() => musicInputRef.current?.click()}>Choose music</button>
          </div>
        </section>
      )}

      {(saving || preview) && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-label="Memory preview">
          <article className={styles.previewCard}>
            {saving ? (
              <div className={styles.savingState}><span className={styles.savingOrb} /><p>{providerLabel(provider)} is preserving this memory…</p><small>The original conversation is already safe on this device.</small></div>
            ) : preview ? (
              <>
                <div className={styles.previewTop}><div><h2>{preview.title}</h2><span>@YOU ∩ COMPANION · {preview.duration}</span></div><time>{preview.date}<br />{preview.time}</time></div>
                <p className={styles.previewSummary}>{preview.summary}</p>
                {preview.diary && <blockquote className={styles.previewDiary}>{preview.diary}</blockquote>}
                <div className={styles.previewTurns}>{preview.turns.map((turn) => <div key={turn.id} className={`${styles.turnBubble} ${turn.role === "user" ? styles.userBubble : ""}`}><p>{turn.original}</p>{turn.translation && <small>{turn.translation}</small>}<button onClick={() => playTurn(turn)} aria-label={turn.audioBlob ? "Replay saved voice" : "Replay with preview voice"}>▶</button></div>)}</div>
                <div className={styles.previewActions}><button onClick={() => void confirmPreview()} disabled={confirming} aria-label="Save to memory">{confirming ? "…" : "✓"}</button><button onClick={() => void navigator.clipboard.writeText(`${preview.title}\n\n${preview.summary}`)} aria-label="Copy summary">▣</button><button onClick={() => setPreview(null)} disabled={confirming} aria-label="Close preview">×</button></div>
              </>
            ) : null}
          </article>
        </div>
      )}

      {settingsOpen && (
        <aside className={styles.settingsPanel} aria-label="设置">
          <div className={styles.settingsTitle}><div><span>会话设置</span><h2>这段记忆应该如何呈现？</h2></div><button onClick={() => setSettingsOpen(false)}>×</button></div>
          <label>AI 模型<select value={provider} onChange={(event) => setProvider(event.target.value)}>{providerOptions.map((option) => <option key={option.provider} value={option.provider} disabled={providerMode === "live" && !option.configured}>{providerLabel(option.provider)}{providerMode === "live" && !option.configured ? " · 未配置密钥" : ""}</option>)}</select></label>
          <label>语音音色<select value={voiceStyle} onChange={(event) => setVoiceStyle(event.target.value)}><option value="intimate">亲密英文</option><option value="reflective">沉思英文</option><option value="bright">明亮英文</option></select></label>
          <label>回复语言<select value={replyLanguage} onChange={(event) => setReplyLanguage(event.target.value as "en" | "zh")}><option value="en">英文优先</option><option value="zh">中文优先</option></select></label>
          <label className={styles.toggleRow}><span><b>允许 AI 理解图片</b><small>仅在你同意后发送压缩副本。</small></span><input type="checkbox" checked={visionEnabled} onChange={(event) => setVisionEnabled(event.target.checked)} /></label>
          <label className={styles.toggleRow}><span><b>在本设备保存我的语音</b><small>每轮语音不会上传到云端存储。</small></span><input type="checkbox" checked={saveVoice} onChange={(event) => setSaveVoice(event.target.checked)} /></label>
          <div className={styles.settingsSectionLabel}><span>粒子场</span><button onClick={() => { setParticleTuning({ ...DEFAULT_PARTICLE_TUNING }); setImageClarity(0.72); setInteractionStrength(1.25); }}>全部重置</button></div>
          <label>粒子扩散 <output>{particleTuning.dispersion.toFixed(1)}</output><input type="range" min="0" max="3" step="0.1" value={particleTuning.dispersion} onChange={(event) => updateParticleTuning("dispersion", Number(event.target.value))} /></label>
          <label>粒子大小 <output>{particleTuning.particleSize.toFixed(1)}</output><input type="range" min="1" max="5" step="0.1" value={particleTuning.particleSize} onChange={(event) => updateParticleTuning("particleSize", Number(event.target.value))} /></label>
          <label>对比度 <output>{particleTuning.contrast.toFixed(1)}</output><input type="range" min="0.6" max="2" step="0.1" value={particleTuning.contrast} onChange={(event) => updateParticleTuning("contrast", Number(event.target.value))} /></label>
          <div className={styles.settingsSectionLabel}><span>光效与边缘</span></div>
          <label>辉光强度 <output>{particleTuning.glowIntensity.toFixed(2)}</output><input type="range" min="0" max="2" step="0.05" value={particleTuning.glowIntensity} onChange={(event) => updateParticleTuning("glowIntensity", Number(event.target.value))} /></label>
          <label>拖尾长度 <output>{particleTuning.trailLength.toFixed(2)}</output><input type="range" min="0" max="1" step="0.02" value={particleTuning.trailLength} onChange={(event) => updateParticleTuning("trailLength", Number(event.target.value))} /></label>
          <label>色相漂移幅度 <output>{particleTuning.hueDrift.toFixed(2)}</output><input type="range" min="0" max="2" step="0.05" value={particleTuning.hueDrift} onChange={(event) => updateParticleTuning("hueDrift", Number(event.target.value))} /></label>
          <label>色相漂移速度 <output>{particleTuning.colorShiftSpeed.toFixed(1)}</output><input type="range" min="0" max="4" step="0.1" value={particleTuning.colorShiftSpeed} onChange={(event) => updateParticleTuning("colorShiftSpeed", Number(event.target.value))} /></label>
          <label>泛光阈值 <output>{particleTuning.bloomThreshold.toFixed(2)}</output><input type="range" min="0" max="0.98" step="0.02" value={particleTuning.bloomThreshold} onChange={(event) => updateParticleTuning("bloomThreshold", Number(event.target.value))} /></label>
          <label>边缘扩散 <output>{particleTuning.edgeDispersion.toFixed(2)}</output><input type="range" min="0" max="2" step="0.05" value={particleTuning.edgeDispersion} onChange={(event) => updateParticleTuning("edgeDispersion", Number(event.target.value))} /></label>
          <label>边缘扰动 <output>{particleTuning.edgeDisturbance.toFixed(2)}</output><input type="range" min="0" max="2" step="0.05" value={particleTuning.edgeDisturbance} onChange={(event) => updateParticleTuning("edgeDisturbance", Number(event.target.value))} /></label>
          <div className={styles.settingsSectionLabel}><span>流场与交互</span></div>
          <label>流动速度 <output>{particleTuning.flowSpeed.toFixed(1)}</output><input type="range" min="0" max="2" step="0.1" value={particleTuning.flowSpeed} onChange={(event) => updateParticleTuning("flowSpeed", Number(event.target.value))} /></label>
          <label>流动幅度 <output>{particleTuning.flowAmplitude.toFixed(1)}</output><input type="range" min="0" max="2.5" step="0.1" value={particleTuning.flowAmplitude} onChange={(event) => updateParticleTuning("flowAmplitude", Number(event.target.value))} /></label>
          <label>湍流强度 <output>{particleTuning.turbulence.toFixed(2)}</output><input type="range" min="0" max="2" step="0.05" value={particleTuning.turbulence} onChange={(event) => updateParticleTuning("turbulence", Number(event.target.value))} /></label>
          <label>噪声尺度 <output>{particleTuning.noiseScale.toFixed(2)}</output><input type="range" min="0.5" max="3" step="0.05" value={particleTuning.noiseScale} onChange={(event) => updateParticleTuning("noiseScale", Number(event.target.value))} /></label>
          <label>景深强度 <output>{particleTuning.depthStrength.toFixed(1)}</output><input type="range" min="0" max="100" step="1" value={particleTuning.depthStrength} onChange={(event) => updateParticleTuning("depthStrength", Number(event.target.value))} /></label>
          <label>鼠标影响半径 <output>{particleTuning.mouseRadius.toFixed(1)}</output><input type="range" min="40" max="220" step="5" value={particleTuning.mouseRadius} onChange={(event) => updateParticleTuning("mouseRadius", Number(event.target.value))} /></label>
          <label>鼠标扰动 <output>{particleTuning.mouseDisturbance.toFixed(2)}</output><input type="range" min="0" max="2" step="0.05" value={particleTuning.mouseDisturbance} onChange={(event) => updateParticleTuning("mouseDisturbance", Number(event.target.value))} /></label>
          <label>漩涡强度 <output>{particleTuning.swirlStrength.toFixed(2)}</output><input type="range" min="0" max="2" step="0.05" value={particleTuning.swirlStrength} onChange={(event) => updateParticleTuning("swirlStrength", Number(event.target.value))} /></label>
          <label>引力井强度 <output>{particleTuning.gravityStrength.toFixed(2)}</output><input type="range" min="0" max="2" step="0.05" value={particleTuning.gravityStrength} onChange={(event) => updateParticleTuning("gravityStrength", Number(event.target.value))} /></label>
          <label>吸引／排斥 <output>{particleTuning.attractionRepulsion === 0 ? "中性" : `${particleTuning.attractionRepulsion < 0 ? "吸引" : "排斥"} ${Math.abs(particleTuning.attractionRepulsion).toFixed(2)}`}</output><input type="range" min="-1" max="1" step="0.05" value={particleTuning.attractionRepulsion} onChange={(event) => updateParticleTuning("attractionRepulsion", Number(event.target.value))} /></label>
          <label>鼠标力场强度 <output>{interactionStrength.toFixed(2)}</output><input type="range" min="0" max="2" step="0.05" value={interactionStrength} onChange={(event) => setInteractionStrength(Number(event.target.value))} /></label>
          <div className={styles.settingsSectionLabel}><span>声音律动</span></div>
          <label>律动强度 <output>{particleTuning.danceStrength.toFixed(1)}</output><input type="range" min="0" max="10" step="0.5" value={particleTuning.danceStrength} onChange={(event) => updateParticleTuning("danceStrength", Number(event.target.value))} /></label>
          <label>景深波动 <output>{particleTuning.depthWave.toFixed(1)}</output><input type="range" min="0" max="10" step="0.5" value={particleTuning.depthWave} onChange={(event) => updateParticleTuning("depthWave", Number(event.target.value))} /></label>
          <label>主体细节 <output>{imageClarity.toFixed(2)}</output><input type="range" min="0.45" max="0.92" step="0.01" value={imageClarity} onChange={(event) => setImageClarity(Number(event.target.value))} /></label>
          <p className={styles.synthDisclosure}>{providerMode === "mock" ? "当前为离线预览模式，不会调用外部模型。" : "当前为实时文字模式。"}此 Demo 暂时使用浏览器合成语音；配置流式语音服务后可替换为更丰富的 AI 音色。</p>
        </aside>
      )}

      <input ref={fileInputRef} className={styles.hiddenInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; if (file) void handleImageUpload(file); }} />
      <input ref={musicInputRef} className={styles.hiddenInput} type="file" accept="audio/*" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; if (file) handleMusicUpload(file); }} />
      {musicUrl && (
        <audio
          className={styles.hiddenAudio}
          ref={musicAudioRef}
          src={musicUrl}
          loop
          onPlay={() => { setMusicPlaying(true); startMusicAnalysis(); }}
          onPause={() => { setMusicPlaying(false); stopMusicAnalysis(); }}
          onEnded={() => { setMusicPlaying(false); stopMusicAnalysis(); }}
          onError={() => { setMusicPlaying(false); stopMusicAnalysis(); flashNotice("This audio file could not be played."); }}
        />
      )}
      {notice && <div className={styles.toast} role="status">{notice}</div>}
    </main>
  );
}

function providerLabel(provider: string) {
  return provider === "deepseek" ? "DeepSeek" : provider === "qwen" ? "Qwen" : provider === "openai" ? "OpenAI" : provider === "anthropic" ? "Claude" : "Gemini";
}

function storedSessionToCard(session: SessionRecord, imageUrl: string): MemoryCard {
  const date = new Date(session.createdAt);
  const title = session.summary?.title.original ?? "Saved conversation";
  const summary = session.summary?.abstract.original ?? "A conversation saved before its summary was ready.";
  return {
    id: session.id,
    gardenItemId: session.gardenItemId,
    imageUrl,
    title,
    summary,
    diary: session.summary?.diary?.body.original,
    date: date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }).toUpperCase(),
    time: date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    duration: formatClock(Math.max(1, Math.round(session.durationMs / 1000))),
    pinnedDate: session.pinnedDate,
    mode: session.mode,
    turns: session.turns.map((turn) => ({
      id: turn.id,
      role: turn.role === "user" ? "user" : "assistant",
      original: turn.text.original,
      translation: turn.text.originalLanguage === "en" ? turn.text.zh : turn.text.en,
      language: turn.text.originalLanguage,
      createdAt: turn.offsetStartMs,
      speakerName: session.mode === "salon" ? session.participants.find((participant) => participant.id === turn.speakerId)?.name : undefined,
    })),
  };
}

function readImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({ width: 720, height: 900 });
    image.src = url;
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      resolve(value.includes(",") ? value.slice(value.indexOf(",") + 1) : value);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read the image."));
    reader.readAsDataURL(blob);
  });
}

function CalendarPanel({
  month,
  cards,
  selectedDate,
  onSelect,
  onMonth,
}: {
  month: Date;
  cards: MemoryCard[];
  selectedDate: string;
  onSelect: (date: string) => void;
  onMonth: (date: Date) => void;
}) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstDay + 1;
    return day >= 1 && day <= days ? day : null;
  });
  const counts = cards.reduce<Record<string, number>>((map, card) => {
    if (card.pinnedDate) map[card.pinnedDate] = (map[card.pinnedDate] ?? 0) + 1;
    return map;
  }, {});
  return (
    <article className={styles.calendarCard}>
      <div className={styles.calendarNav}><button onClick={() => onMonth(new Date(year, monthIndex - 1, 1))}>‹</button><h2>{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2><button onClick={() => onMonth(new Date(year, monthIndex + 1, 1))}>›</button></div>
      <div className={styles.weekdays}>{["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
      <div className={styles.calendarGrid}>
        {cells.map((day, index) => {
          if (!day) return <span key={`blank-${index}`} />;
          const key = `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
          const count = counts[key] ?? 0;
          return <button key={key} className={selectedDate === key ? styles.daySelected : ""} onClick={() => onSelect(key)}><span>{day}</span>{count > 0 && <i>{Array.from({ length: Math.min(3, count) }, (_, dot) => <b key={dot} />)}{count > 3 && <small>+</small>}</i>}</button>;
        })}
      </div>
      <p>{selectedDate ? `${counts[selectedDate] ?? 0} memories pinned · select a day to pin the newest` : "Choose a day"}</p>
    </article>
  );
}
