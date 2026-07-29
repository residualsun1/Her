"use client";
/* eslint-disable @next/next/no-img-element -- object URLs and canvas fallbacks cannot use Next image optimization */

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import {
  DEFAULT_PARTICLE_TUNING,
  type ParticleTuning,
} from "./particleConfig";
import { memoryStore } from "@/app/lib/memory/store";
import type {
  CalendarDate,
  ImageContext as StoredImageContext,
  SessionRecord,
  Turn as StoredTurn,
} from "@/app/lib/memory/types";
import styles from "./HerApp.module.css";

const ParticleGarden = lazy(() => import("./ParticleGarden"));
const USER_WORDS_HOLD_MS = 2_400;

type View = "conversation" | "garden" | "memory" | "music";
type MemoryTab = "cards" | "calendar";
type ReplyState = "idle" | "listening" | "holding" | "thinking" | "speaking" | "ready";
type ProviderOption = { provider: string; configured: boolean; liveAdapterImplemented: boolean };
type ProviderCapability = {
  capability: string;
  provider: string;
  mode: "mock" | "live";
  configured: boolean;
  model: string | null;
};

type AtmosphereHypothesis = {
  label: string;
  evidence: string;
  confidence: "low" | "medium" | "high";
};

type ClientImageContext = {
  description: string;
  objects: string[];
  atmosphereHypotheses: AtmosphereHypothesis[];
  dominantColors: string[];
  possibleTopics: string[];
  openingQuestion: string;
  provider?: string;
  model?: string;
};

type ChatTurn = {
  id: string;
  role: "user" | "assistant";
  original: string;
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
  turns: ChatTurn[];
};

type MusicTrack = {
  id: string;
  name: string;
  url: string;
};

type SpeechRecognitionResultLike = {
  0: { transcript: string };
  isFinal: boolean;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<SpeechRecognitionResultLike> }) => void) | null;
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
  imageContext?: ClientImageContext;
};

type DeleteTarget =
  | { kind: "garden"; item: GardenVisualItem }
  | { kind: "memory"; card: MemoryCard };

const HIDDEN_SAMPLE_GARDEN_KEY = "her-hidden-sample-garden";
const HIDDEN_SAMPLE_CARDS_KEY = "her-hidden-sample-cards";
const VOICE_WAVE_PROFILE = [0.72, 1.05, 1.42, 0.94, 1.68, 1.18, 1.52, 0.88, 1.34, 1.02, 0.76];

const averageFrequencyBand = (data: Uint8Array, start: number, end: number) => {
  const from = Math.max(0, Math.min(start, data.length));
  const to = Math.max(from + 1, Math.min(end, data.length));
  let total = 0;
  for (let index = from; index < to; index += 1) total += data[index];
  return total / (to - from) / 255;
};

const resumeAudioContext = async (
  context: AudioContext,
  timeoutMs = 1_800,
) => {
  if (context.state === "running") return true;
  if (context.state === "closed") return false;
  let timeout: number | undefined;
  try {
    await Promise.race([
      context.resume(),
      new Promise<void>((resolve) => {
        timeout = window.setTimeout(resolve, timeoutMs);
      }),
    ]);
    return (context.state as string) === "running";
  } catch {
    return false;
  } finally {
    if (timeout !== undefined) window.clearTimeout(timeout);
  }
};

const PARAMETER_NOTES = {
  particleCount: "调高会让图像更细腻，也更消耗 GPU；出现卡顿时优先降低。",
  particleSize: "调高后颗粒更醒目，调低后画面更细密、主体更清晰。",
  trailLength: "调高会留下更长的运动轨迹；过高时画面可能糊成光带。",
  imageClarity: "控制主体微粒的密实度；调高更像清晰磨砂纹理，但不会显示固定原图底板。",
  coreRetention: "调高可稳定主体轮廓，调低会让更多粒子离开原位。",
  haloWidth: "调高会让外围星云扩展得更远，星团看起来更蓬松。",
  haloDensity: "调高会让外缘更饱满，同时增加粒子叠加亮度。",
  edgeFeather: "调高会让图像到黑色背景的过渡更柔和。",
  clusterIrregularity: "调高可打破原图矩形边缘；过高可能侵蚀主体轮廓。",
  densityGamma: "调低会保留更多暗部粒子，调高会集中突出明亮区域。",
  peelThreshold: "调低会剥离更多边缘，调高则只影响最明显的轮廓。",
  erosionRate: "调高会加快粒子的剥离与循环速度，调低更像慢动作。",
  emberLifespan: "调高会让离开原位的粒子在空中停留更久。",
  diffusion: "主要控制边缘粒子的扩散距离；主体会保持稳定，调高后外围更松散。",
  edgePerturbation: "调高会增加边缘粒子的随机抖动和不确定感。",
  edgeScatter: "调高会给边缘粒子更强的向外推力。",
  flowSpeed: "控制整个流场的时间速度；调高后漩涡变化更快。",
  flowAmplitude: "控制流场推动粒子的距离；调高后起伏更明显。",
  depthStrength: "控制 Z 轴透视程度；调高后前后层次更强。",
  depthWave: "控制画面折叠起伏的幅度；过高可能影响主体辨识。",
  homeSpring: "调高会更快拉回原图位置，调低会让粒子漂浮更久。",
  velocityDamping: "调高会保留更久的惯性，调低会让粒子更快停下。",
  noiseStrength: "调高会让流体运动更明显，也会增加画面不稳定感。",
  noiseFrequency: "调高会产生更细小的漩涡，调低则形成大范围流动。",
  windX: "负值向左吹，正值向右吹；接近零时以噪声流场为主。",
  windY: "负值向下吹，正值向上吹；微小正值更像缓慢上升。",
  interactionStrength: "控制鼠标所有作用的总倍率；设为零可关闭交互。",
  mouseRadius: "调高会扩大鼠标影响范围，调低只扰动指针附近粒子。",
  mouseSwirl: "调高会增强鼠标周围的旋转和黑洞涡流感。",
  mouseRepulsion: "控制波谷周围少量横向推开的力度；过高会削弱主体辨识度。",
  mouseDepthPull: "控制鼠标波谷的深度与隆起边缘，是悬停立体感的主要参数。",
  contrast: "调高会拉开明暗差异；过高可能丢失暗部细节。",
  hueDrift: "控制颜色可偏移的最大角度；零表示保持原图色彩。",
  colorShiftSpeed: "控制颜色随时间变化的速度，不改变粒子运动速度。",
  luminanceMultiplier: "整体放大高亮区域；过高会让亮部接近白色。",
  highlightGain: "调高会强化每颗粒子的发光核心。",
  bloomStrength: "调高会扩大柔和光晕；过高可能让粒子互相粘连。",
  rhythmIntensity: "控制音乐对剥离和基础律动的总体影响。",
  danceStrength: "控制低音推动深度波的幅度，适合表现鼓点。",
  subjectRhythmStrength: "控制整幅主体随音乐产生的轻微呼吸与起伏；设为零可完全关闭，不会单独拉扯某一侧边缘。",
  audioBrightnessStrength: "控制音量对亮度的影响；零表示亮度不随音乐变化。",
  audioBloomStrength: "控制强音时外围粒子的光晕，主体区域只会受到很轻的影响。",
  bassGain: "放大低频检测结果；低音较弱的音乐可适当调高。",
  flowReactStrength: "控制音乐对流场速度与幅度的附加影响。",
  depthReactStrength: "控制低音对 Z 轴折叠的影响，过高会产生剧烈翻涌。",
  sparkleReactStrength: "控制高频触发的边缘星光闪烁，适合旋律和镲片。",
  audioNoiseGate: "调高会忽略较弱声音，可过滤环境底噪和静音杂波。",
  audioDynamicCurve: "低于 1 会放大弱音乐响应，高于 1 会突出强拍。",
  audioAttack: "数值越小，粒子越快随强拍亮起；过小可能产生频闪。",
  audioRelease: "数值越大，亮度和律动回落得越慢、越有呼吸感。",
  reactTarget: "选择音乐额外影响的视觉属性，不会关闭其他基础映射。",
  audioSmoothing: "调高会更平稳但反应更慢，调低会更灵敏。",
} as const;

function ParameterNote({ name }: { name: keyof typeof PARAMETER_NOTES }) {
  return <small className={styles.parameterNote}>{PARAMETER_NOTES[name]}</small>;
}

const SAMPLE_GARDEN: GardenVisualItem[] = [
  { id: "winter-light", title: "冬日微光", imageUrl: "/demo/light-in-winter.jpg", precomposed: true },
  { id: "blue-rain", title: "蓝色雨夜", imageUrl: "/demo/dark-blue.jpg", precomposed: true },
  { id: "deep-blue", title: "深蓝", imageUrl: "/demo/deep-blue.jpg", precomposed: true },
  { id: "miss-you", title: "想念你", imageUrl: "/demo/miss-you.jpg", precomposed: true },
];

const SAMPLE_CARDS: MemoryCard[] = [
  {
    id: "sample-melancholy",
    imageUrl: "/demo/light-in-winter.jpg",
    title: "冬日微光",
    summary: "新雪中的一盏暖灯，开启了关于冬天、归家与被人记住的温柔对话。",
    date: "2025年12月04日",
    time: "上午10:49",
    duration: "01:21",
    pinnedDate: "2025-12-04",
    turns: [
      {
        id: "sample-a1",
        role: "assistant",
        original: "那棵可怜巴巴的小树。你这是提前怀念圣诞节了吗？",
        language: "zh",
        createdAt: 0,
      },
      {
        id: "sample-u1",
        role: "user",
        original: "我每年圣诞都会重看那部老电影，但每次的感觉都不一样。",
        language: "zh",
        createdAt: 12_000,
      },
      {
        id: "sample-a2",
        role: "assistant",
        original: "也许电影留在原地，是为了让你看见自己已经走了多远。",
        language: "zh",
        createdAt: 24_000,
      },
    ],
  },
  {
    id: "sample-traveler",
    imageUrl: "/demo/deep-blue.jpg",
    title: "深蓝",
    summary: "星空下的原野变成了一张地图，记录的不是你去了哪里，而是你愿意默默跨越多远。",
    date: "2025年11月30日",
    time: "下午02:57",
    duration: "03:09",
    pinnedDate: "2025-11-30",
    turns: [
      {
        id: "sample-a3",
        role: "assistant",
        original: "你真的带着你的小伙伴一路去了巴黎？",
        language: "zh",
        createdAt: 0,
      },
      {
        id: "sample-u2",
        role: "user",
        original: "它让那座陌生城市稍微有了一点属于我的感觉。",
        language: "zh",
        createdAt: 9_000,
      },
    ],
  },
];

const DEFAULT_TURNS: ChatTurn[] = [
  {
    id: "welcome",
    role: "assistant",
    original: "这张照片里有一种温柔，仿佛夜晚为这一刻暂停了。",
    language: "zh",
    createdAt: 0,
  },
];

const pad = (value: number) => String(value).padStart(2, "0");
const formatClock = (seconds: number) => `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
const localDateKey = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` as CalendarDate;

const SPOKEN_CLAUSE_END = /[，。！？；：、,.!?;:]$/u;
const SPOKEN_SENTENCE_END = /[。！？.!?]$/u;
const CHINESE_CHARACTER = /[\u3400-\u9fff]/u;

const formatSpeechRecognitionResults = (
  results: ArrayLike<SpeechRecognitionResultLike>,
) => {
  let transcript = "";
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const segment = result?.[0]?.transcript.trim();
    if (!segment) continue;
    transcript += segment;
    if (result.isFinal && !SPOKEN_CLAUSE_END.test(segment)) {
      transcript += CHINESE_CHARACTER.test(segment) ? "，" : ", ";
    }
  }
  return transcript.trim();
};

const finishSpeechTranscript = (value: string) => {
  const transcript = value.trim();
  if (!transcript) return "";
  if (/[，,]\s*$/u.test(transcript)) {
    return transcript.replace(/[，,]\s*$/u, CHINESE_CHARACTER.test(transcript) ? "。" : ".");
  }
  if (SPOKEN_SENTENCE_END.test(transcript)) return transcript;
  return `${transcript}${CHINESE_CHARACTER.test(transcript) ? "。" : "."}`;
};

const storedImageContextToClient = (
  context: StoredImageContext | undefined,
): ClientImageContext | undefined => {
  if (!context) return undefined;
  return {
    description: context.description.original,
    objects: context.observedDetails ?? [],
    atmosphereHypotheses: context.atmosphereHypotheses ?? [],
    dominantColors: context.dominantColors ?? [],
    possibleTopics: (context.possibleTopics ?? []).map((topic) => topic.original),
    openingQuestion:
      context.openingQuestion?.original ??
      "这幅画面也许留着某种情绪，但我不想替你决定。重新看见它时，你有什么感觉？",
    provider: context.model?.provider,
    model: context.model?.model,
  };
};

const readHiddenSampleIds = (key: string) => {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set<string>();
  }
};

const hideSampleId = (key: string, id: string) => {
  const hidden = readHiddenSampleIds(key);
  hidden.add(id);
  window.localStorage.setItem(key, JSON.stringify([...hidden]));
};

export function HerApp() {
  const [view, setView] = useState<View>("conversation");
  const [memoryTab, setMemoryTab] = useState<MemoryTab>("cards");
  const [imageUrl, setImageUrl] = useState("/demo/light-in-winter.jpg");
  const [imagePrecomposed, setImagePrecomposed] = useState(false);
  const [imageTitle, setImageTitle] = useState("冬日微光");
  const [gardenItems, setGardenItems] = useState<GardenVisualItem[]>(SAMPLE_GARDEN);
  const [gardenIndex, setGardenIndex] = useState(0);
  const [turns, setTurns] = useState<ChatTurn[]>(DEFAULT_TURNS);
  const [replyState, setReplyState] = useState<ReplyState>("ready");
  const [input, setInput] = useState("");
  const [sentEcho, setSentEcho] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [elapsed, setElapsed] = useState(3);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [provider, setProvider] = useState("qwen");
  const [providerMode, setProviderMode] = useState<"mock" | "live">("mock");
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([
    "deepseek", "qwen", "openai", "anthropic", "gemini",
  ].map((name) => ({ provider: name, configured: true, liveAdapterImplemented: true })));
  const [voiceStyle, setVoiceStyle] = useState("intimate");
  const [visionEnabled, setVisionEnabled] = useState(true);
  const [saveVoice, setSaveVoice] = useState(true);
  const [imageContext, setImageContext] = useState<ClientImageContext | null>({
    description: "安静的冬日雪夜里，一盏温暖的路灯正在发光。",
    objects: ["雪地", "路灯", "夜色"],
    atmosphereHypotheses: [{
      label: "安静而温暖",
      evidence: "深色夜景里只有一处暖光。",
      confidence: "medium",
    }],
    dominantColors: ["黑色", "蓝色", "暖黄色"],
    possibleTopics: ["冬夜", "归家", "为某个人留着的一盏灯"],
    openingQuestion: "暖光让我隐约想到一种被等待的感觉，但这只是猜测。它对你来说意味着什么？",
  });
  const [audioLevel, setAudioLevel] = useState(0.06);
  const [audioBands, setAudioBands] = useState({ bass: 0.02, mid: 0.015, treble: 0.01 });
  const [interactionStrength, setInteractionStrength] = useState(1.25);
  const [imageClarity, setImageClarity] = useState(0.82);
  const [particleTuning, setParticleTuning] = useState<ParticleTuning>({ ...DEFAULT_PARTICLE_TUNING });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<MemoryCard | null>(null);
  const [readingCard, setReadingCard] = useState<MemoryCard | null>(null);
  const [cards, setCards] = useState<MemoryCard[]>(SAMPLE_CARDS);
  const [cardIndex, setCardIndex] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [activeGardenItem, setActiveGardenItem] = useState<GardenVisualItem | null>(null);
  const [conversationFromGarden, setConversationFromGarden] = useState(false);
  const [conversationChromeVisible, setConversationChromeVisible] = useState(true);
  const [immersiveMode, setImmersiveMode] = useState(false);
  const [particleZoom, setParticleZoom] = useState(1);
  const [calendarMonth, setCalendarMonth] = useState(new Date(2025, 11, 1));
  const [selectedDate, setSelectedDate] = useState("2025-12-04");
  const [musicUrl, setMusicUrl] = useState<string | null>(null);
  const [musicName, setMusicName] = useState("尚未选择音乐");
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([]);
  const [musicListOpen, setMusicListOpen] = useState(true);
  const [particleInfo, setParticleInfo] = useState("正在准备粒子");
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
  const speechSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const speechAnalyserRef = useRef<AnalyserNode | null>(null);
  const speechAudioContextRef = useRef<AudioContext | null>(null);
  const speechAnalyserFrameRef = useRef<number | null>(null);
  const speechRequestRef = useRef(0);
  const speechCacheRef = useRef<Map<string, Blob>>(new Map());
  const chunksRef = useRef<Blob[]>([]);
  const transcriptRef = useRef("");
  const replyDelayRunRef = useRef(0);
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
  const lastAudioUiUpdateRef = useRef(0);
  const musicUrlsRef = useRef<string[]>([]);
  const gardenStripRef = useRef<HTMLDivElement>(null);
  const gardenCursorRef = useRef<HTMLSpanElement>(null);
  const gardenWheelDeltaRef = useRef(0);
  const gardenWheelLockRef = useRef(0);
  const gardenDragRef = useRef({
    pointerId: -1,
    startX: 0,
    scrollLeft: 0,
    moved: false,
    mode: null as "artwork" | "gallery" | null,
  });
  const revealTimerRef = useRef<number | null>(null);

  const currentAssistant = [...turns].reverse().find((turn) => turn.role === "assistant");
  const visualAudioLevel = Math.min(1, audioLevel);
  const updateParticleTuning = useCallback(<Key extends keyof ParticleTuning,>(
    key: Key,
    value: ParticleTuning[Key],
  ) => {
    setParticleTuning((current) => ({ ...current, [key]: value }));
  }, []);

  const flashNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2800);
  }, []);

  const stopSpeechPlayback = useCallback(() => {
    speechRequestRef.current += 1;
    if (speechPulseRef.current) {
      window.clearInterval(speechPulseRef.current);
      speechPulseRef.current = null;
    }
    if (speechAnalyserFrameRef.current) {
      window.cancelAnimationFrame(speechAnalyserFrameRef.current);
      speechAnalyserFrameRef.current = null;
    }
    const activeSource = speechSourceRef.current;
    if (activeSource) {
      activeSource.onended = null;
      try {
        activeSource.stop();
      } catch {
        // The source may already have reached its natural end.
      }
      activeSource.disconnect();
      speechSourceRef.current = null;
    }
    speechAnalyserRef.current?.disconnect();
    speechAnalyserRef.current = null;
    window.speechSynthesis?.cancel();
    setAudioLevel(0.05);
    setAudioBands({ bass: 0.02, mid: 0.015, treble: 0.01 });
  }, []);

  const getSpeechAudioContext = useCallback(() => {
    const existing = speechAudioContextRef.current;
    if (existing && existing.state !== "closed") return existing;
    const context = new AudioContext({ latencyHint: "interactive" });
    speechAudioContextRef.current = context;
    return context;
  }, []);

  const primeSpeechPlayback = useCallback(() => {
    try {
      const context = getSpeechAudioContext();
      if (context.state !== "running") void context.resume().catch(() => undefined);
    } catch {
      // Browser speech remains available as a clearly labeled fallback.
    }
  }, [getSpeechAudioContext]);

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
      .then((result: {
        capabilities?: ProviderCapability[];
        providers?: Array<ProviderOption & { mode?: "mock" | "live" }>;
      }) => {
        if (!active || !result.providers?.length) return;
        setProviderOptions(result.providers);
        setProviderMode(result.providers[0]?.mode === "live" ? "live" : "mock");
        const chatCapability = result.capabilities?.find(
          (capability) => capability.capability === "chat",
        );
        if (chatCapability?.provider && chatCapability.configured) {
          setProvider(chatCapability.provider);
        }
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
    const hiddenGardenIds = readHiddenSampleIds(HIDDEN_SAMPLE_GARDEN_KEY);
    const nextGardenItems = [
      ...gardens.map((garden) => ({
        id: garden.id,
        title: garden.title?.original ?? garden.image.filename.replace(/\.[^.]+$/, ""),
        imageUrl: gardenUrls.get(garden.id)!,
        imageContext: storedImageContextToClient(garden.imageContext),
      })),
      ...SAMPLE_GARDEN.filter((item) => !hiddenGardenIds.has(item.id)),
    ];
    setGardenItems(nextGardenItems);
    setGardenIndex((index) => Math.min(index, Math.max(0, nextGardenItems.length - 1)));
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
    const hiddenCardIds = readHiddenSampleIds(HIDDEN_SAMPLE_CARDS_KEY);
    const nextCards = [...valid, ...SAMPLE_CARDS.filter((card) => !hiddenCardIds.has(card.id))];
    setCards(nextCards);
    setCardIndex((index) => Math.min(index, Math.max(0, nextCards.length - 1)));
  }, []);

  useEffect(() => {
    const uploadUrls = uploadUrlsRef.current;
    const musicUrls = musicUrlsRef.current;
    const loadTimer = window.setTimeout(() => void refreshSavedCards(), 0);
    return () => {
      window.clearTimeout(loadTimer);
      persistedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      uploadUrls.forEach((url) => URL.revokeObjectURL(url));
      musicUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [refreshSavedCards]);

  useEffect(() => {
    return () => {
      captureRunRef.current += 1;
      replyDelayRunRef.current += 1;
      try { recognitionRef.current?.stop(); } catch { /* browser already stopped it */ }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (analyserFrameRef.current) cancelAnimationFrame(analyserFrameRef.current);
      if (musicAnalyserFrameRef.current) cancelAnimationFrame(musicAnalyserFrameRef.current);
      if (speechAnalyserFrameRef.current) cancelAnimationFrame(speechAnalyserFrameRef.current);
      if (speechPulseRef.current) window.clearInterval(speechPulseRef.current);
      speechSourceRef.current?.stop();
      window.speechSynthesis?.cancel();
      void audioContextRef.current?.close();
      void musicAudioContextRef.current?.close();
      void speechAudioContextRef.current?.close();
      if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
    };
  }, []);

  const cancelPendingReply = useCallback(() => {
    replyDelayRunRef.current += 1;
    setSentEcho(null);
    setReplyState((current) => current === "holding" ? "ready" : current);
  }, []);

  useEffect(() => {
    if (!immersiveMode) return;
    const exitImmersive = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImmersiveMode(false);
    };
    window.addEventListener("keydown", exitImmersive);
    return () => window.removeEventListener("keydown", exitImmersive);
  }, [immersiveMode]);

  useEffect(() => {
    if (!readingCard) return;
    const previousOverflow = document.body.style.overflow;
    const closeReader = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReadingCard(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeReader);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeReader);
    };
  }, [readingCard]);

  const speak = useCallback(
    (text: string, onEnd?: () => void, voiceOffset = 0, languageOverride?: "en" | "zh") => {
      stopSpeechPlayback();
      const speechRun = speechRequestRef.current;
      const spokenLanguage = languageOverride ?? "zh";
      setReplyState("ready");

      const finish = () => {
        if (speechRun !== speechRequestRef.current) return;
        if (speechPulseRef.current) {
          window.clearInterval(speechPulseRef.current);
          speechPulseRef.current = null;
        }
        setAudioLevel(0.05);
        setAudioBands({ bass: 0.02, mid: 0.015, treble: 0.01 });
        setReplyState("ready");
        onEnd?.();
      };

      const fallbackToBrowserVoice = () => {
        if (speechRun !== speechRequestRef.current) return;
        if (!("speechSynthesis" in window)) {
          finish();
          return;
        }
        const utterance = new SpeechSynthesisUtterance(text);
        const voices = window.speechSynthesis
          .getVoices()
          .filter((voice) => voice.lang.toLowerCase().startsWith(spokenLanguage === "en" ? "en" : "zh"));
        if (voices.length) {
          utterance.voice = voices[
            (voiceOffset + (voiceStyle === "reflective" ? 1 : 0)) %
              voices.length
          ];
        }
        utterance.lang = spokenLanguage === "en" ? "en-US" : "zh-CN";
        utterance.rate = voiceStyle === "intimate" ? 0.9 : voiceStyle === "bright" ? 1.03 : 0.95;
        utterance.pitch = voiceStyle === "reflective" ? 0.9 : 1;
        utterance.onstart = () => {
          if (speechRun !== speechRequestRef.current) return;
          setReplyState("speaking");
          speechPulseRef.current = window.setInterval(
            () => setAudioLevel(0.28 + Math.random() * 0.58),
            90,
          );
        };
        utterance.onend = finish;
        utterance.onerror = finish;
        window.speechSynthesis.speak(utterance);
      };

      const playSynthesizedAudio = async (blob: Blob) => {
        if (speechRun !== speechRequestRef.current) return;
        const context = getSpeechAudioContext();
        if (!(await resumeAudioContext(context))) {
          throw new Error("Audio output has not been unlocked");
        }
        const buffer = await context.decodeAudioData(await blob.arrayBuffer());
        if (speechRun !== speechRequestRef.current) return;
        const source = context.createBufferSource();
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.72;
        source.buffer = buffer;
        source.connect(analyser);
        analyser.connect(context.destination);
        speechSourceRef.current = source;
        speechAnalyserRef.current = analyser;

        const releaseAudio = () => {
          if (speechSourceRef.current !== source) return;
          if (speechAnalyserFrameRef.current) {
            window.cancelAnimationFrame(speechAnalyserFrameRef.current);
            speechAnalyserFrameRef.current = null;
          }
          source.onended = null;
          source.disconnect();
          analyser.disconnect();
          speechSourceRef.current = null;
          speechAnalyserRef.current = null;
          finish();
        };

        setReplyState("speaking");
        setAudioLevel(0.2);
        const frequencies = new Uint8Array(analyser.frequencyBinCount);
        const updateWaveform = () => {
          if (
            speechRun !== speechRequestRef.current ||
            speechSourceRef.current !== source
          ) return;
          analyser.getByteFrequencyData(frequencies);
          const bass = averageFrequencyBand(frequencies, 1, 10);
          const mid = averageFrequencyBand(frequencies, 10, 38);
          const treble = averageFrequencyBand(frequencies, 38, 90);
          setAudioBands({ bass, mid, treble });
          setAudioLevel(
            Math.min(1, 0.04 + bass * 0.7 + mid * 0.88 + treble * 0.36),
          );
          speechAnalyserFrameRef.current =
            window.requestAnimationFrame(updateWaveform);
        };
        source.onended = releaseAudio;
        updateWaveform();
        source.start();
      };

      const synthesize = async () => {
        const cacheKey = `${voiceStyle}:${spokenLanguage}:${text}`;
        let blob = speechCacheRef.current.get(cacheKey);
        if (!blob) {
          const response = await fetch("/api/tts/synthesize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text,
              voiceId: voiceStyle,
              language: spokenLanguage,
            }),
          });
          if (!response.ok) throw new Error("TTS provider unavailable");
          blob = await response.blob();
          if (!blob.size || !blob.type.startsWith("audio/")) {
            throw new Error("TTS provider returned invalid audio");
          }
          speechCacheRef.current.set(cacheKey, blob);
          if (speechCacheRef.current.size > 18) {
            const oldest = speechCacheRef.current.keys().next().value;
            if (oldest) speechCacheRef.current.delete(oldest);
          }
        }
        await playSynthesizedAudio(blob);
      };

      void synthesize().catch(fallbackToBrowserVoice);
    },
    [getSpeechAudioContext, stopSpeechPlayback, voiceStyle],
  );

  const playTurn = useCallback((turn: ChatTurn) => {
    primeSpeechPlayback();
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
  }, [primeSpeechPlayback, speak, stopSpeechPlayback]);

  const submitMessage = useCallback(
    async (raw: string, audioBlob?: Blob) => {
      const message = raw.trim();
      if (!message || replyState === "holding" || replyState === "thinking") return;
      stopSpeechPlayback();
      primeSpeechPlayback();
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
      const replyRun = ++replyDelayRunRef.current;
      setSentEcho(message);
      setReplyState("holding");
      await new Promise<void>((resolve) => window.setTimeout(resolve, USER_WORDS_HOLD_MS));
      if (replyRun !== replyDelayRunRef.current) return;
      setSentEcho(null);
      setReplyState("thinking");
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            provider,
            replyLanguage: "zh",
            imageContext: imageContext ?? undefined,
            history: turns.slice(-10).map((turn) => ({ role: turn.role, text: turn.original, language: turn.language })),
          }),
        });
        const result = (await response.json()) as { text?: string; error?: { message?: string } };
        if (!response.ok || !result.text) {
          throw new Error(result.error?.message ?? "chat provider unavailable");
        }
        const text = result.text ?? "我在。告诉我，这张图片里什么最像是仍然活着的？";
        const assistantTurn: ChatTurn = {
          id: crypto.randomUUID(),
          role: "assistant",
          original: text,
          language: "zh",
          createdAt: (elapsed + 1) * 1000,
        };
        setTurns((items) => [...items, assistantTurn]);
        speak(text);
      } catch {
        const fallback = "也许图像只是入口，真正的记忆就藏在它身后。";
        setTurns((items) => [...items, {
          id: crypto.randomUUID(), role: "assistant", original: fallback, language: "zh", createdAt: (elapsed + 1) * 1000,
        }]);
        flashNotice("AI 暂时没有回应，这句话来自本地陪伴模式。");
        speak(fallback);
      }
    },
    [elapsed, flashNotice, imageContext, primeSpeechPlayback, provider, replyState, saveVoice, speak, stopSpeechPlayback, turns],
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
    // recorder.stop() is issued synchronously. Release the microphone tracks
    // and resume output before the first await, while this pointer-up/click is
    // still a trusted user gesture. This avoids mobile browsers leaving the
    // output AudioContext interrupted after the first recorded turn.
    const blobPromise = stopRecorder();
    mediaRecorderRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    primeSpeechPlayback();
    const blob = await blobPromise;
    if (analyserFrameRef.current) cancelAnimationFrame(analyserFrameRef.current);
    analyserFrameRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") await context.close().catch(() => undefined);
    setAudioLevel(0.05);
    setReplyState("idle");
    const captured = finishSpeechTranscript(transcriptRef.current);
    if (submit) await submitMessage(captured || input || "这张照片让我觉得很熟悉。", blob);
    else {
      setLiveTranscript("");
      transcriptRef.current = "";
    }
  }, [input, primeSpeechPlayback, stopRecorder, submitMessage]);

  const beginListening = useCallback(async () => {
    if (replyState === "listening" || captureStartingRef.current || mediaRecorderRef.current?.state === "recording") return;
    const captureRun = ++captureRunRef.current;
    captureStartingRef.current = true;
    pendingCaptureStopRef.current = null;
    stopSpeechPlayback();
    primeSpeechPlayback();
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
        const bassBins = Math.max(4, Math.floor(data.length * 0.16));
        const trebleStart = Math.floor(data.length * 0.58);
        const bass = averageFrequencyBand(data, 0, bassBins);
        const mid = averageFrequencyBand(data, bassBins, trebleStart);
        const treble = averageFrequencyBand(data, trebleStart, data.length);
        const average = averageFrequencyBand(data, 0, data.length);
        const now = performance.now();
        if (now - lastAudioUiUpdateRef.current > 50) {
          lastAudioUiUpdateRef.current = now;
          setAudioLevel(Math.min(1, average * 2.2 + bass * 0.58 + 0.04));
          setAudioBands({ bass, mid, treble });
        }
        analyserFrameRef.current = requestAnimationFrame(tick);
      };
      tick();

      const SpeechRecognitionCtor = (window as unknown as {
        SpeechRecognition?: new () => SpeechRecognitionLike;
        webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
      if (SpeechRecognitionCtor) {
        const recognition = new SpeechRecognitionCtor();
        recognition.lang = "zh-CN";
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event) => {
          const text = formatSpeechRecognitionResults(event.results);
          transcriptRef.current = text;
          setLiveTranscript(text);
        };
        recognition.onerror = () => flashNotice("语音转写暂不可用，但录音仍在继续。");
        recognition.start();
        recognitionRef.current = recognition;
      } else {
        flashNotice("当前环境不支持实时转写，你仍可输入文字或录制一段语音。");
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
        flashNotice("语音对话需要麦克风权限。");
      }
    }
  }, [flashNotice, primeSpeechPlayback, replyState, stopListening, stopSpeechPlayback]);

  const handleMicPointerDown = () => {
    recordingStartedRef.current = performance.now();
    startedOnPointerRef.current = replyState !== "listening";
    if (startedOnPointerRef.current) void beginListening();
  };

  const handleMicPointerUp = () => {
    const heldFor = performance.now() - recordingStartedRef.current;
    if (captureStartingRef.current) {
      if (!startedOnPointerRef.current || heldFor > 360) pendingCaptureStopRef.current = true;
      else flashNotice("录音已锁定，结束时请再次点击。");
      return;
    }
    if (!startedOnPointerRef.current) {
      void stopListening(true);
    } else if (heldFor > 360) {
      void stopListening(true);
    } else {
      flashNotice("录音已锁定，结束时请再次点击。");
    }
  };

  const handleImageUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      flashNotice("请选择 PNG、JPEG 或 WebP 图片。");
      return;
    }
    if (replyState === "listening" || captureStartingRef.current) await stopListening(false);
    stopSpeechPlayback();
    primeSpeechPlayback();
    cancelPendingReply();
    const objectUrl = URL.createObjectURL(file);
    uploadUrlsRef.current.push(objectUrl);
    setImageUrl(objectUrl);
    setImagePrecomposed(false);
    setImageTitle(file.name.replace(/\.[^.]+$/, ""));
    setView("conversation");
    setImmersiveMode(false);
    setParticleZoom(1);
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
    const uploadedItem: GardenVisualItem = {
      id: garden.id,
      title: file.name,
      imageUrl: objectUrl,
    };
    setActiveGardenItem(uploadedItem);
    setGardenItems((items) => [uploadedItem, ...items]);

    let context: ClientImageContext | null = null;
    if (visionEnabled) {
      try {
        const contentBase64 = file.size <= 5_500_000 ? await blobToBase64(file) : undefined;
        const response = await fetch("/api/image-context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            consent: true,
            language: "zh",
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
        const result = (await response.json()) as Partial<ClientImageContext> & {
          error?: { message?: string };
        };
        if (!response.ok || !result.description || !result.openingQuestion) {
          throw new Error(result.error?.message ?? "image context unavailable");
        }
        context = {
          description: result.description,
          objects: result.objects ?? [],
          atmosphereHypotheses: result.atmosphereHypotheses ?? [],
          dominantColors: result.dominantColors ?? [],
          possibleTopics: result.possibleTopics ?? [],
          openingQuestion: result.openingQuestion,
          provider: result.provider,
          model: result.model,
        };
        await memoryStore.updateGardenItem(garden.id, {
          image: {
            ...garden.image,
            dominantColors: context.dominantColors,
          },
          imageContext: {
            description: { original: context.description, originalLanguage: "zh" },
            observedDetails: context.objects,
            atmosphereHypotheses: context.atmosphereHypotheses,
            dominantColors: context.dominantColors,
            possibleTopics: context.possibleTopics.map((topic) => ({
              original: topic,
              originalLanguage: "zh",
            })),
            openingQuestion: {
              original: context.openingQuestion,
              originalLanguage: "zh",
            },
            ...(context.provider && context.model
              ? { model: { provider: context.provider, model: context.model } }
              : {}),
            userConsented: true,
          },
        });
        setGardenItems((items) =>
          items.map((item) =>
            item.id === garden.id ? { ...item, imageContext: context ?? undefined } : item,
          ),
        );
        setActiveGardenItem((item) =>
          item?.id === garden.id
            ? { ...item, imageContext: context ?? undefined }
            : item,
        );
      } catch {
        context = null;
        flashNotice("图片已保存在本机，但 AI 暂时没有读懂它。你仍然可以继续对话。");
      }
    }
    setImageContext(context);
    const welcome =
      context?.openingQuestion ??
      "我正和你一起看着这段记忆。它对你来说，留住了什么感受？";
    const assistantTurn: ChatTurn = {
      id: crypto.randomUUID(), role: "assistant", original: welcome, language: "zh", createdAt: 0,
    };
    setTurns([assistantTurn]);
    speak(welcome);
  }, [cancelPendingReply, flashNotice, primeSpeechPlayback, replyState, speak, stopListening, stopSpeechPlayback, visionEnabled]);

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
    const fallbackTitle = "一段安静的对话";
    const fallbackSummary = "这段对话保留了图片唤起的感受，以及说出口之后仍留在心里的部分。";
    try {
      const garden = await ensureCurrentGarden();
      const draftTurns: StoredTurn[] = turns.map((turn) => ({
        id: turn.id,
        role: turn.role,
        speakerId: turn.role === "user" ? "you" : "companion",
        text: {
          original: turn.original,
          originalLanguage: turn.language,
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
            primaryLanguage: "zh",
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
            primaryLanguage: "zh",
            saveStatus: "summarizing",
          });
      draftSessionIdRef.current = draft.id;
      const response = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: "zh",
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
        date: now.toLocaleDateString("zh-CN", { month: "long", day: "2-digit", year: "numeric" }),
        time: now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
        duration: formatClock(elapsed),
        turns,
      };
      setPreview(nextPreview);
      await memoryStore.updateSessionRecord(draft.id, {
        saveStatus: "draft",
        summary: {
          title: { original: nextPreview.title, originalLanguage: "zh" },
          abstract: { original: nextPreview.summary, originalLanguage: "zh" },
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
        diary: `今天，我和一张图片待了一会儿。${turns.filter((turn) => turn.role === "user").map((turn) => turn.original).join(" ")}`,
        date: now.toLocaleDateString("zh-CN", { month: "long", day: "2-digit", year: "numeric" }),
        time: now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
        duration: formatClock(elapsed),
        turns,
      });
      flashNotice("对话已安全保存在本机，稍后可以重试生成摘要。");
    } finally {
      setSaving(false);
    }
  }, [elapsed, ensureCurrentGarden, flashNotice, imageUrl, provider, saving, turns, voiceStyle]);

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
      primaryLanguage: "zh",
      saveStatus: "ready" as const,
      summary: {
        title: { original: preview.title, originalLanguage: "zh" },
        abstract: { original: preview.summary, originalLanguage: "zh" },
        moodTags: ["reflective", "tender"],
        generatedAt: now,
        ...(preview.diary ? {
          diary: {
            body: { original: preview.diary, originalLanguage: "zh" },
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
      flashNotice("记忆已保存，请选择一个日期。");
    } catch {
      await Promise.all(createdAudioIds.map((id) => memoryStore.deleteAudioAsset(id).catch(() => undefined)));
      flashNotice("草稿仍然安全，但此设备暂时无法完成保存。");
    } finally {
      setConfirming(false);
    }
  }, [confirming, elapsed, ensureCurrentGarden, flashNotice, preview, refreshSavedCards, saveVoice, voiceStyle]);

  const pinNewestMemory = useCallback(async (date: string) => {
    const selectedCard = cards[cardIndex];
    const targetId = pendingPinIdRef.current ?? (selectedCard && !selectedCard.id.startsWith("sample-") ? selectedCard.id : undefined);
    if (!targetId) {
      flashNotice("请先保存一段新对话，再选择日期。");
      return;
    }
    try {
      await memoryStore.pinSession(targetId, date as CalendarDate);
      pendingPinIdRef.current = undefined;
      setCards((items) => items.map((item) => (item.id === targetId ? { ...item, pinnedDate: date } : item)));
      flashNotice(`已固定到 ${date}。`);
    } catch {
      flashNotice("暂时无法固定这段记忆。");
    }
  }, [cardIndex, cards, flashNotice]);

  const chooseMusicTrack = (track: MusicTrack, autoplay = true) => {
    setMusicUrl(track.url);
    setMusicName(track.name);
    window.setTimeout(() => {
      const audio = musicAudioRef.current;
      if (!audio) return;
      audio.load();
      if (autoplay) void audio.play().catch(() => flashNotice("请再点击一次播放按钮以开始音乐。"));
    }, 0);
  };

  const handleMusicUpload = (files: FileList | File[]) => {
    const accepted = Array.from(files).filter((file) => {
      const extension = file.name.split(".").pop()?.toLowerCase();
      return extension === "mp3" || extension === "flac";
    });
    if (!accepted.length) {
      flashNotice("请选择 .mp3 或 .flac 音乐文件。");
      return;
    }
    const tracks = accepted.map((file) => {
      const url = URL.createObjectURL(file);
      musicUrlsRef.current.push(url);
      return { id: crypto.randomUUID(), name: file.name, url };
    });
    setMusicTracks((current) => [...current, ...tracks]);
    setMusicListOpen(true);
    chooseMusicTrack(tracks[0]);
    if (accepted.length !== Array.from(files).length) {
      flashNotice("已添加支持的音乐，其他格式已跳过。");
    }
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
      const trebleStart = Math.floor(spectrum.length * 0.58);
      const bass = averageFrequencyBand(spectrum, 0, bassBins);
      const mid = averageFrequencyBand(spectrum, bassBins, trebleStart);
      const treble = averageFrequencyBand(spectrum, trebleStart, spectrum.length);
      const average = averageFrequencyBand(spectrum, 0, spectrum.length);
      const now = performance.now();
      if (now - lastAudioUiUpdateRef.current > 50) {
        lastAudioUiUpdateRef.current = now;
        setAudioLevel(Math.min(1, 0.035 + average * 1.15 + bass * 0.62));
        setAudioBands({ bass, mid, treble });
      }
      musicAnalyserFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const stopMusicAnalysis = () => {
    if (musicAnalyserFrameRef.current) cancelAnimationFrame(musicAnalyserFrameRef.current);
    musicAnalyserFrameRef.current = null;
    setAudioLevel(0.05);
    setAudioBands({ bass: 0.02, mid: 0.015, treble: 0.01 });
  };

  const handleMusicPlay = async () => {
    const audio = musicAudioRef.current;
    if (!audio) return;
    if (audio.paused) await audio.play().catch(() => flashNotice("请再点击一次播放按钮以开始音乐。"));
    else audio.pause();
  };

  const handleGardenPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest(`.${styles.deleteMemoryButton}`)) return;
    const strip = event.currentTarget;
    const interactingWithArtwork = Boolean((event.target as HTMLElement).closest("[data-garden-index]"));
    gardenDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: strip.scrollLeft,
      moved: false,
      mode: interactingWithArtwork ? "artwork" : "gallery",
    };
    if (gardenCursorRef.current) gardenCursorRef.current.dataset.active = "true";
  };

  const handleGardenPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const cursor = gardenCursorRef.current;
    if (cursor) {
      const bounds = event.currentTarget.getBoundingClientRect();
      cursor.style.left = `${event.clientX - bounds.left}px`;
      cursor.style.top = `${event.clientY - bounds.top}px`;
      cursor.style.opacity = "1";
    }
    const drag = gardenDragRef.current;
    if (drag.pointerId !== event.pointerId) return;
    const delta = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(delta) > 5) {
      drag.moved = true;
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    }
    if (drag.moved) {
      event.preventDefault();
      event.currentTarget.scrollLeft = drag.scrollLeft - delta * 1.08;
    }
  };

  const settleGardenSelection = (strip: HTMLDivElement, snap = false) => {
    const stripCenter = strip.getBoundingClientRect().left + strip.clientWidth / 2;
    let nearestIndex = gardenIndex;
    let nearestDistance = Number.POSITIVE_INFINITY;
    strip.querySelectorAll<HTMLElement>("[data-garden-index]").forEach((item) => {
      const bounds = item.getBoundingClientRect();
      const distance = Math.abs(bounds.left + bounds.width / 2 - stripCenter);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = Number(item.dataset.gardenIndex);
      }
    });
    setGardenIndex(nearestIndex);
    if (snap) {
      strip.querySelector<HTMLElement>(`[data-garden-index="${nearestIndex}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  };

  const handleGardenPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (gardenDragRef.current.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const drag = gardenDragRef.current;
    const totalDelta = event.clientX - drag.startX;
    const mode = drag.mode;
    const moved = drag.moved;
    gardenDragRef.current.pointerId = -1;
    gardenDragRef.current.mode = null;
    if (gardenCursorRef.current) gardenCursorRef.current.dataset.active = "false";
    if (!mode) return;
    if (moved && Math.abs(totalDelta) > 42) {
      focusGardenItem(gardenIndex + (totalDelta < 0 ? 1 : -1));
      return;
    }
    if (!moved && mode === "artwork") return;
    settleGardenSelection(event.currentTarget, true);
  };

  const handleGardenWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX)
      ? event.deltaY
      : event.deltaX;
    const now = event.timeStamp;
    if (now < gardenWheelLockRef.current) {
      gardenWheelDeltaRef.current = 0;
      return;
    }
    gardenWheelDeltaRef.current += delta;
    if (Math.abs(gardenWheelDeltaRef.current) < 24) return;
    const direction = gardenWheelDeltaRef.current > 0 ? 1 : -1;
    gardenWheelDeltaRef.current = 0;
    gardenWheelLockRef.current = now + 360;
    focusGardenItem(gardenIndex + direction);
  };

  const handleParticleWheel = (event: ReactWheelEvent<HTMLElement>) => {
    if (view !== "conversation") return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, button, [role='dialog']")) return;
    event.preventDefault();
    const delta = Math.max(-180, Math.min(180, event.deltaY));
    setParticleZoom((current) => Math.max(
      0.55,
      Math.min(2.5, current * Math.exp(-delta * 0.0017)),
    ));
  };

  const focusGardenItem = (index: number) => {
    if (!gardenItems.length) return;
    const normalized = Math.max(0, Math.min(index, gardenItems.length - 1));
    setGardenIndex(normalized);
    gardenStripRef.current
      ?.querySelector<HTMLElement>(`[data-garden-index="${normalized}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  };

  const openGardenConversation = (item = gardenItems[gardenIndex]) => {
    if (!item) return;
    cancelPendingReply();
    primeSpeechPlayback();
    setImageUrl(item.imageUrl);
    setImagePrecomposed(Boolean(item.precomposed));
    setImageTitle(item.title);
    setImageContext(item.imageContext ?? null);
    setActiveGardenItem(item);
    currentGardenIdRef.current = SAMPLE_GARDEN.some((sample) => sample.id === item.id) ? undefined : item.id;
    draftSessionIdRef.current = undefined;
    const welcome =
      item.imageContext?.openingQuestion ??
      "我记得这张图片。现在重新回到这里，什么感觉变得不一样了？";
    setTurns([{
      id: crypto.randomUUID(),
      role: "assistant",
      original: welcome,
      language: "zh",
      createdAt: 0,
    }]);
    setElapsed(0);
    setReplyState("ready");
    setConversationFromGarden(true);
    setConversationChromeVisible(false);
    setImmersiveMode(false);
    setParticleZoom(1);
    if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
    revealTimerRef.current = window.setTimeout(() => {
      setConversationChromeVisible(true);
      revealTimerRef.current = null;
    }, 1700);
    setView("conversation");
    speak(welcome);
  };

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || deleting) return;
    const target = deleteTarget;
    const deletingActiveGarden =
      target.kind === "garden" && activeGardenItem?.id === target.item.id;
    setDeleting(true);
    try {
      if (target.kind === "garden") {
        const isSample = SAMPLE_GARDEN.some((item) => item.id === target.item.id);
        if (isSample) hideSampleId(HIDDEN_SAMPLE_GARDEN_KEY, target.item.id);
        else await memoryStore.deleteGardenItem(target.item.id, { cascadeSessions: true });
      } else {
        const isSample = SAMPLE_CARDS.some((card) => card.id === target.card.id);
        if (isSample) hideSampleId(HIDDEN_SAMPLE_CARDS_KEY, target.card.id);
        else await memoryStore.deleteSessionRecord(target.card.id);
      }
      if (deletingActiveGarden) {
        stopSpeechPlayback();
        currentGardenIdRef.current = undefined;
        draftSessionIdRef.current = undefined;
        setActiveGardenItem(null);
        setSettingsOpen(false);
        setConversationFromGarden(false);
        setConversationChromeVisible(true);
        setView("garden");
      }
      setDeleteTarget(null);
      await refreshSavedCards();
      flashNotice(target.kind === "garden" ? "已从记忆中移除。" : "记忆已删除。");
    } catch {
      flashNotice("暂时无法删除这段记忆。");
    } finally {
      setDeleting(false);
    }
  }, [activeGardenItem, deleteTarget, deleting, flashNotice, refreshSavedCards, stopSpeechPlayback]);

  const navigateTo = (nextView: View) => {
    cancelPendingReply();
    setImmersiveMode(false);
    if (nextView !== "conversation" && (replyState === "listening" || captureStartingRef.current)) {
      void stopListening(false);
    }
    stopSpeechPlayback();
    if (nextView === "conversation") {
      if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
      setConversationFromGarden(false);
      setConversationChromeVisible(true);
    }
    setView(nextView);
  };

  return (
    <main className={`${styles.app} ${view === "garden" ? styles.gardenMode : ""} ${immersiveMode ? styles.immersiveMode : ""}`}>
      <header className={styles.header}>
        <button className={styles.wordmark} onClick={() => navigateTo("conversation")} aria-label="打开对话">
          <span className={styles.wordmarkDot} /> Her
        </button>
        <nav className={styles.nav} aria-label="主导航">
          <button className={view === "garden" ? styles.navActive : ""} aria-current={view === "garden" ? "page" : undefined} onClick={() => navigateTo("garden")}>记忆</button>
          <button className={view === "memory" ? styles.navActive : ""} aria-current={view === "memory" ? "page" : undefined} onClick={() => { navigateTo("memory"); setMemoryTab("cards"); }}>回廊</button>
          <button className={view === "music" ? styles.navActive : ""} aria-current={view === "music" ? "page" : undefined} onClick={() => navigateTo("music")}>音乐</button>
        </nav>
        <button className={styles.iconButton} onClick={() => setSettingsOpen(true)} aria-label="打开设置">
          <span className={styles.tuneIcon}><i /><i /><i /></span>
        </button>
      </header>

      {view === "conversation" && (
        <section
          className={`${styles.stage} ${immersiveMode ? styles.immersiveStage : ""}`}
          onWheel={handleParticleWheel}
          aria-label="对话场景"
        >
          <Suspense fallback={<div className={styles.particleLoading} aria-hidden="true" />}>
            <ParticleGarden
              imageUrl={imageUrl}
              audioLevel={visualAudioLevel}
              audioBands={audioBands}
              interactionStrength={interactionStrength}
              imageClarity={imageClarity}
              zoom={view === "conversation" ? particleZoom : 1}
              precomposed={imagePrecomposed}
              tuning={particleTuning}
              className={styles.particleCanvas}
              onReady={(info) => setParticleInfo(`${info.pointCount.toLocaleString()} 个粒子`)}
            />
          </Suspense>
          <div className={styles.vignette} />
          {view === "conversation" && (
            <button
              className={styles.immersiveToggle}
              onClick={() => {
                setSettingsOpen(false);
                setImmersiveMode((current) => !current);
              }}
              aria-pressed={immersiveMode}
              aria-label={immersiveMode ? "显示界面" : "隐藏界面并进入沉浸模式"}
              title={immersiveMode ? "显示界面（Esc）" : "滚动鼠标滚轮可缩放粒子图像"}
            >
              <span className={styles.immersiveIcon} aria-hidden="true">
                <i /><i /><i /><i />
              </span>
              <small>{Math.round(particleZoom * 100)}%</small>
            </button>
          )}
          {(!conversationFromGarden || conversationChromeVisible) && (
            <time className={`${styles.conversationTimer} ${conversationFromGarden ? styles.delayedChrome : ""}`} dateTime={`PT${elapsed}S`}>
              {formatClock(elapsed)}
            </time>
          )}

          {(!conversationFromGarden || conversationChromeVisible) && <div className={`${styles.conversationUi} ${conversationFromGarden ? styles.delayedChrome : ""}`}>
              {replyState === "thinking" && <div className={styles.thinking}>对方正在思考 <span>·</span><span>·</span><span>·</span></div>}
              {sentEcho && <div className={styles.sentEcho} aria-live="polite"><p>{sentEcho}</p></div>}
              {!sentEcho && currentAssistant && (
                <article className={`${styles.replyCard} ${conversationFromGarden ? styles.gardenQuestion : ""} ${replyState === "speaking" ? styles.replySpeaking : ""}`}>
                  <div className={styles.miniWave} aria-hidden="true">{VOICE_WAVE_PROFILE.map((shape, index) => <i key={index} style={{ "--voice-amplitude": Math.max(0.4, 0.3 + visualAudioLevel * shape) } as CSSProperties} />)}</div>
                  <p>{currentAssistant.original}</p>
                </article>
              )}
              {replyState === "listening" && liveTranscript && <div className={styles.transcriptCard}>{liveTranscript}</div>}

              <div className={styles.conversationControls}>
                <div className={`${styles.inputBar} ${replyState === "listening" ? styles.inputListening : ""}`}>
                  <input
                    value={input}
                    disabled={replyState === "holding" || replyState === "thinking"}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && !event.nativeEvent.isComposing && void submitMessage(input)}
                    placeholder={replyState === "listening" ? "正在聆听…" : "在这里输入…"}
                    aria-label="输入消息"
                  />
                  <button
                    className={styles.micButton}
                    disabled={replyState === "holding" || replyState === "thinking"}
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
                    aria-label={replyState === "listening" ? "结束录音" : "开始录音"}
                  >
                    <span className={styles.micGlyph} />
                  </button>
                </div>
                {replyState === "listening" && (
                  <div className={styles.recordingTools}>
                    <span><b className={styles.recordingDot} /> 录音 {formatClock(Math.max(1, recordingElapsed))}</span>
                    <button onClick={() => void stopListening(false)}>取消</button>
                  </div>
                )}
                <div className={styles.sessionBar}>
                  <button className={styles.uploadMemoryButton} onClick={() => fileInputRef.current?.click()} aria-label="上传图片">
                    <span className={styles.imageUploadIcon} aria-hidden="true"><i /></span>
                  </button>
                  <button className={styles.saveButton} onClick={() => void saveMemory()}>留住记忆 <span>›</span></button>
                  <button className={styles.closeButton} onClick={() => { cancelPendingReply(); void stopListening(false); setTurns([]); setElapsed(0); draftSessionIdRef.current = undefined; }} aria-label="结束对话">×</button>
                </div>
              </div>
            </div>
          }
          {(!conversationFromGarden || conversationChromeVisible) && <span className={`${styles.particleMeta} ${conversationFromGarden ? styles.delayedChrome : ""}`}>{particleInfo}</span>}
        </section>
      )}

      {view === "garden" && (
        <section className={styles.galleryPage}>
          {gardenItems.length ? (
            <>
              <div
                ref={gardenStripRef}
                className={styles.gardenStrip}
                onPointerDown={handleGardenPointerDown}
                onPointerMove={handleGardenPointerMove}
                onPointerUp={handleGardenPointerUp}
                onPointerCancel={handleGardenPointerUp}
                onWheel={handleGardenWheel}
                onPointerLeave={() => {
                  if (gardenDragRef.current.pointerId === -1 && gardenCursorRef.current) {
                    gardenCursorRef.current.style.opacity = "0";
                  }
                }}
                aria-label="粒子记忆，左右拖动即可浏览"
              >
                <div
                  className={styles.gardenTrack}
                  style={{
                    "--garden-width": `${Math.max(100, 42 + gardenItems.length * 58)}vw`,
                    "--garden-mobile-width": `${Math.max(100, 28 + gardenItems.length * 72)}vw`,
                  } as CSSProperties}
                >
                  {gardenItems.map((item, index) => (
                    <article
                      key={item.id}
                      data-garden-index={index}
                      className={`${styles.gardenParticleFrame} ${index === gardenIndex ? styles.gardenParticleActive : ""}`}
                      style={{
                        "--garden-left": `${12 + index * 58}vw`,
                        "--garden-mobile-left": `${2 + index * 72}vw`,
                        "--garden-top": `${index % 4 === 0 ? 1 : index % 4 === 1 ? 7 : index % 4 === 2 ? 3 : 10}%`,
                      } as CSSProperties}
                    >
                      {Math.abs(index - gardenIndex) <= 1 ? (
                        <Suspense fallback={<div className={styles.particleLoading} aria-hidden="true" />}>
                          <ParticleGarden
                            imageUrl={item.imageUrl}
                            audioLevel={index === gardenIndex ? 0.1 : 0.045}
                            audioBands={audioBands}
                            interactionStrength={1.1}
                            imageClarity={0.82}
                            precomposed={item.precomposed}
                            preview
                            tuning={particleTuning}
                            className={styles.gardenParticle}
                          />
                        </Suspense>
                      ) : (
                        <img className={styles.gardenDistantImage} src={item.imageUrl} alt="" aria-hidden="true" />
                      )}
                      <button
                        type="button"
                        className={styles.openGardenButton}
                        onClick={() => {
                          if (gardenDragRef.current.moved) {
                            gardenDragRef.current.moved = false;
                            return;
                          }
                          if (index !== gardenIndex) {
                            focusGardenItem(index);
                            return;
                          }
                          openGardenConversation(item);
                        }}
                        aria-label={`打开${item.title}`}
                      />
                      <button
                        type="button"
                        className={styles.deleteMemoryButton}
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteTarget({ kind: "garden", item });
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        aria-label={`删除${item.title}`}
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    </article>
                  ))}
                </div>
                <span ref={gardenCursorRef} className={styles.galleryCursor} aria-hidden="true" />
              </div>
              <button
                className={`${styles.gardenArrow} ${styles.gardenArrowLeft}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  focusGardenItem(gardenIndex - 1);
                }}
                disabled={gardenIndex === 0}
                aria-label="上一段记忆"
              >
                ‹
              </button>
              <button
                className={`${styles.gardenArrow} ${styles.gardenArrowRight}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  focusGardenItem(gardenIndex + 1);
                }}
                disabled={gardenIndex === gardenItems.length - 1}
                aria-label="下一段记忆"
              >
                ›
              </button>
              <div className={styles.gardenDots} aria-label={`${gardenIndex + 1} of ${gardenItems.length}`}>
                {gardenItems.map((item, index) => (
                  <button
                    key={item.id}
                    className={index === gardenIndex ? styles.gardenDotActive : ""}
                    onClick={() => focusGardenItem(index)}
                    aria-label={`显示${item.title}`}
                    aria-current={index === gardenIndex ? "true" : undefined}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className={styles.emptyState}><span>这里还很安静</span><p>准备好时上传一张图片，让一段记忆从这里生长。</p></div>
          )}
          <button className={styles.uploadMore} onClick={() => fileInputRef.current?.click()} aria-label="上传更多图片">
            <span aria-hidden="true">↥</span>
          </button>
        </section>
      )}

      {view === "memory" && (
        <section className={styles.memoryPage}>
          <div className={styles.memoryHeader}>
            <div><span>昼夜纪事</span><h1>你和我的记忆，<br />比前方的路更长。</h1></div>
            <div className={styles.tabSwitch}><button className={memoryTab === "cards" ? styles.tabActive : ""} onClick={() => setMemoryTab("cards")}>卡片</button><button className={memoryTab === "calendar" ? styles.tabActive : ""} onClick={() => setMemoryTab("calendar")}>日历</button></div>
          </div>
          {memoryTab === "cards" ? (
            <>
              {cards.length ? <div className={styles.cardCarousel}>
                {cards.map((card, index) => {
                  const offset = index - cardIndex;
                  if (Math.abs(offset) > 2) return null;
                  return (
                    <article
                      key={card.id}
                      className={`${styles.memoryCard} ${offset === 0 ? styles.memoryCardActive : ""}`}
                      style={{ "--card-offset": offset } as CSSProperties}
                      tabIndex={offset === 0 ? 0 : -1}
                      aria-label={offset === 0 ? `展开阅读${card.title}` : `切换到${card.title}`}
                      onClick={(event) => {
                        if ((event.target as HTMLElement).closest("button")) return;
                        if (offset !== 0) setCardIndex(index);
                        else setReadingCard(card);
                      }}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
                        event.preventDefault();
                        if (offset !== 0) setCardIndex(index);
                        else setReadingCard(card);
                      }}
                    >
                      {offset === 0 && (
                        <button
                          className={styles.cardDeleteButton}
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteTarget({ kind: "memory", card });
                          }}
                            aria-label={`删除${card.title}`}
                          >
                            <span aria-hidden="true">×</span>
                        </button>
                      )}
                      <img src={card.imageUrl} alt="记忆封面" />
                      <div className={styles.cardBody}>
                        <h2>{card.title}</h2>
                        <div className={styles.cardMeta}><span>@你 ∩ 陪伴者 · {card.duration}</span><span>{card.date}<br />{card.time}</span></div>
                        <p className={styles.cardSummary}>{card.summary}</p>
                        <div className={styles.turnList}>
                          {card.turns.map((turn) => (
                            <div key={turn.id} className={`${styles.turnBubble} ${turn.role === "user" ? styles.userBubble : ""}`}>
                              {turn.speakerName && <b>{turn.speakerName}</b>}<p>{turn.original}</p>
                              <button onClick={(event) => { event.stopPropagation(); playTurn(turn); }} aria-label={turn.audioBlob ? "播放已保存语音" : "播放预览语音"}>▶</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div> : <div className={styles.emptyState}><span>还没有保存的记忆</span><p>下一段保存的对话会出现在这里。</p></div>}
              {cards.length > 0 && <div className={styles.cardNav}><button onClick={() => setCardIndex((index) => Math.max(0, index - 1))}>‹</button><span>{pad(cardIndex + 1)} / {pad(cards.length)}</span><button onClick={() => setCardIndex((index) => Math.min(cards.length - 1, index + 1))}>›</button></div>}
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
          <div className={styles.musicCopy}><span>氛围</span><h1>给记忆一间<br />可以栖居的房间。</h1><p>从设备中导入音乐，文件只会留在当前页面；粒子会跟随旋律与你一起呼吸。</p></div>
          <div className={styles.musicArea}>
            <div className={styles.musicPlayer}>
              <div><small>正在播放</small><strong>{musicName}</strong></div>
              <button onClick={() => void handleMusicPlay()} disabled={!musicUrl} aria-label={musicPlaying ? "暂停" : "播放"}>{musicPlaying ? "Ⅱ" : "▶"}</button>
              <button onClick={() => musicInputRef.current?.click()}>添加音乐</button>
            </div>
            <div className={styles.musicLibrary}>
              <button
                className={styles.musicLibraryToggle}
                onClick={() => setMusicListOpen((open) => !open)}
                aria-expanded={musicListOpen}
              >
                <span>音乐列表 <small>{musicTracks.length}</small></span>
                <b>{musicListOpen ? "收起" : "展开"} {musicListOpen ? "⌃" : "⌄"}</b>
              </button>
              {musicListOpen && (
                <div className={styles.musicTrackList}>
                  {musicTracks.length ? musicTracks.map((track, index) => (
                    <button
                      key={track.id}
                      className={track.url === musicUrl ? styles.musicTrackActive : ""}
                      onClick={() => chooseMusicTrack(track)}
                    >
                      <span>{pad(index + 1)}</span>
                      <strong>{track.name}</strong>
                      <i>{track.url === musicUrl && musicPlaying ? "播放中" : track.url === musicUrl ? "已选择" : "播放"}</i>
                    </button>
                  )) : (
                    <p>还没有音乐。你可以添加多个 `.mp3` 或 `.flac` 文件。</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {(saving || preview) && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-label="记忆预览">
          <article className={styles.previewCard}>
            {saving ? (
              <div className={styles.savingState}><span className={styles.savingOrb} /><p>{providerLabel(provider)} 正在保存这段记忆…</p><small>原始对话已经安全保存在此设备中。</small></div>
            ) : preview ? (
              <>
                <div className={styles.previewTop}><div><h2>{preview.title}</h2><span>@你 ∩ 陪伴者 · {preview.duration}</span></div><time>{preview.date}<br />{preview.time}</time></div>
                <p className={styles.previewSummary}>{preview.summary}</p>
                {preview.diary && <blockquote className={styles.previewDiary}>{preview.diary}</blockquote>}
                <div className={styles.previewTurns}>{preview.turns.map((turn) => <div key={turn.id} className={`${styles.turnBubble} ${turn.role === "user" ? styles.userBubble : ""}`}><p>{turn.original}</p><button onClick={() => playTurn(turn)} aria-label={turn.audioBlob ? "播放已保存语音" : "播放预览语音"}>▶</button></div>)}</div>
                <div className={styles.previewActions}><button onClick={() => void confirmPreview()} disabled={confirming} aria-label="保存到回廊">{confirming ? "…" : "✓"}</button><button onClick={() => void navigator.clipboard.writeText(`${preview.title}\n\n${preview.summary}`)} aria-label="复制摘要">▣</button><button onClick={() => setPreview(null)} disabled={confirming} aria-label="关闭预览">×</button></div>
              </>
            ) : null}
          </article>
        </div>
      )}

      {readingCard && (
        <div
          className={styles.memoryReaderBackdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="memory-reader-title"
          onClick={() => setReadingCard(null)}
        >
          <img className={styles.memoryReaderAmbient} src={readingCard.imageUrl} alt="" aria-hidden="true" />
          <button
            type="button"
            className={styles.memoryReaderClose}
            onClick={() => setReadingCard(null)}
            aria-label="关闭沉浸阅读"
          >
            ×
          </button>
          <article className={styles.memoryReader} onClick={(event) => event.stopPropagation()}>
            <header className={styles.memoryReaderHero}>
              <img src={readingCard.imageUrl} alt={`${readingCard.title}的记忆封面`} />
              <div>
                <span>一段被留住的记忆</span>
                <h2 id="memory-reader-title">{readingCard.title}</h2>
                <p>{readingCard.summary}</p>
                <time>{readingCard.date} · {readingCard.time} · {readingCard.duration}</time>
              </div>
            </header>
            {readingCard.diary && (
              <section className={styles.memoryReaderDiary}>
                <span>记忆札记</span>
                <blockquote>{readingCard.diary}</blockquote>
              </section>
            )}
            <section className={styles.memoryReaderConversation} aria-label="完整对话">
              <div className={styles.memoryReaderSectionTitle}>
                <span>完整对话</span>
                <small>{readingCard.turns.length} 段话语</small>
              </div>
              <div className={styles.memoryReaderTurns}>
                {readingCard.turns.map((turn) => (
                  <article
                    key={turn.id}
                    className={`${styles.memoryReaderTurn} ${turn.role === "user" ? styles.memoryReaderTurnUser : ""}`}
                  >
                    <span>{turn.speakerName ?? (turn.role === "user" ? "你" : "Her")}</span>
                    <p>{turn.original}</p>
                    <button
                      type="button"
                      onClick={() => playTurn(turn)}
                      aria-label={turn.audioBlob ? "播放已保存语音" : "播放这段话语"}
                    >
                      ▶
                    </button>
                  </article>
                ))}
              </div>
            </section>
          </article>
        </div>
      )}

      {deleteTarget && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="delete-memory-title">
          <article className={styles.deleteConfirm}>
            <span>移除记忆</span>
            <h2 id="delete-memory-title">要让这段记忆离开吗？</h2>
            <p>
              {deleteTarget.kind === "garden"
                ? "这张粒子图像及其关联的对话都将被移除。"
                : "这段已保存的对话将从回廊中移除。"}
            </p>
            <strong>{deleteTarget.kind === "garden" ? deleteTarget.item.title : deleteTarget.card.title}</strong>
            <div>
              <button onClick={() => setDeleteTarget(null)} disabled={deleting}>保留</button>
              <button onClick={() => void confirmDelete()} disabled={deleting}>{deleting ? "正在移除…" : "删除"}</button>
            </div>
          </article>
        </div>
      )}

      {settingsOpen && (
        <aside className={styles.settingsPanel} aria-label="设置">
          <div className={styles.settingsTitle}>
            <div><span>粒子场</span></div>
            <button onClick={() => setSettingsOpen(false)} aria-label="关闭设置">×</button>
          </div>

          <div className={styles.settingsSectionLabel}>
            <span>基础物理</span>
            <button onClick={() => { setParticleTuning({ ...DEFAULT_PARTICLE_TUNING }); setImageClarity(0.72); setInteractionStrength(1.25); }}>重置</button>
          </div>
          <label>粒子数量 <output>{Math.round(particleTuning.particleCount / 1000)}k</output><input type="range" min="10000" max="1000000" step="10000" value={particleTuning.particleCount} onChange={(event) => updateParticleTuning("particleCount", Number(event.target.value))} /><ParameterNote name="particleCount" /></label>
          <label>粒子基础大小 <output>{particleTuning.particleSize.toFixed(1)}</output><input type="range" min="0.1" max="5" step="0.1" value={particleTuning.particleSize} onChange={(event) => updateParticleTuning("particleSize", Number(event.target.value))} /><ParameterNote name="particleSize" /></label>
          <label>拖尾长度 <output>{particleTuning.trailLength.toFixed(2)}</output><input type="range" min="0" max="0.99" step="0.01" value={particleTuning.trailLength} onChange={(event) => updateParticleTuning("trailLength", Number(event.target.value))} /><ParameterNote name="trailLength" /></label>
          <label>画面保真 <output>{imageClarity.toFixed(2)}</output><input type="range" min="0.38" max="0.96" step="0.01" value={imageClarity} onChange={(event) => setImageClarity(Number(event.target.value))} /><ParameterNote name="imageClarity" /></label>

          <div className={styles.settingsSectionLabel}><span>星团形态</span></div>
          <label>核心保留 <output>{particleTuning.coreRetention.toFixed(2)}</output><input type="range" min="0.5" max="0.98" step="0.01" value={particleTuning.coreRetention} onChange={(event) => updateParticleTuning("coreRetention", Number(event.target.value))} /><ParameterNote name="coreRetention" /></label>
          <label>星云宽度 <output>{particleTuning.haloWidth.toFixed(2)}</output><input type="range" min="0" max="0.5" step="0.01" value={particleTuning.haloWidth} onChange={(event) => updateParticleTuning("haloWidth", Number(event.target.value))} /><ParameterNote name="haloWidth" /></label>
          <label>星云密度 <output>{particleTuning.haloDensity.toFixed(2)}</output><input type="range" min="0" max="0.8" step="0.01" value={particleTuning.haloDensity} onChange={(event) => updateParticleTuning("haloDensity", Number(event.target.value))} /><ParameterNote name="haloDensity" /></label>
          <label>边缘羽化 <output>{particleTuning.edgeFeather.toFixed(2)}</output><input type="range" min="0.02" max="0.6" step="0.01" value={particleTuning.edgeFeather} onChange={(event) => updateParticleTuning("edgeFeather", Number(event.target.value))} /><ParameterNote name="edgeFeather" /></label>
          <label>轮廓不规则度 <output>{particleTuning.clusterIrregularity.toFixed(2)}</output><input type="range" min="0" max="0.8" step="0.01" value={particleTuning.clusterIrregularity} onChange={(event) => updateParticleTuning("clusterIrregularity", Number(event.target.value))} /><ParameterNote name="clusterIrregularity" /></label>
          <label>暗部粒子保留 <output>{particleTuning.densityGamma.toFixed(2)}</output><input type="range" min="0.3" max="1.5" step="0.01" value={particleTuning.densityGamma} onChange={(event) => updateParticleTuning("densityGamma", Number(event.target.value))} /><ParameterNote name="densityGamma" /></label>

          <div className={styles.settingsSectionLabel}><span>诗意消散</span></div>
          <label>边缘剥离阈值 <output>{particleTuning.peelThreshold.toFixed(2)}</output><input type="range" min="0.02" max="0.98" step="0.01" value={particleTuning.peelThreshold} onChange={(event) => updateParticleTuning("peelThreshold", Number(event.target.value))} /><ParameterNote name="peelThreshold" /></label>
          <label>时间侵蚀率 <output>{particleTuning.erosionRate.toFixed(2)}</output><input type="range" min="0.02" max="1.5" step="0.01" value={particleTuning.erosionRate} onChange={(event) => updateParticleTuning("erosionRate", Number(event.target.value))} /><ParameterNote name="erosionRate" /></label>
          <label>余烬寿命 <output>{particleTuning.emberLifespan.toFixed(1)}s</output><input type="range" min="0.5" max="15" step="0.1" value={particleTuning.emberLifespan} onChange={(event) => updateParticleTuning("emberLifespan", Number(event.target.value))} /><ParameterNote name="emberLifespan" /></label>
          <label>粒子扩散 <output>{particleTuning.diffusion.toFixed(1)}</output><input type="range" min="0" max="4" step="0.1" value={particleTuning.diffusion} onChange={(event) => updateParticleTuning("diffusion", Number(event.target.value))} /><ParameterNote name="diffusion" /></label>
          <label>边缘扰动 <output>{particleTuning.edgePerturbation.toFixed(1)}</output><input type="range" min="0" max="5" step="0.1" value={particleTuning.edgePerturbation} onChange={(event) => updateParticleTuning("edgePerturbation", Number(event.target.value))} /><ParameterNote name="edgePerturbation" /></label>
          <label>边缘扩散 <output>{particleTuning.edgeScatter.toFixed(1)}</output><input type="range" min="0" max="20" step="0.2" value={particleTuning.edgeScatter} onChange={(event) => updateParticleTuning("edgeScatter", Number(event.target.value))} /><ParameterNote name="edgeScatter" /></label>

          <div className={styles.settingsSectionLabel}><span>风场与噪声</span></div>
          <label>流动速度 <output>{particleTuning.flowSpeed.toFixed(1)}</output><input type="range" min="0" max="3" step="0.1" value={particleTuning.flowSpeed} onChange={(event) => updateParticleTuning("flowSpeed", Number(event.target.value))} /><ParameterNote name="flowSpeed" /></label>
          <label>流动幅度 <output>{particleTuning.flowAmplitude.toFixed(1)}</output><input type="range" min="0" max="3" step="0.1" value={particleTuning.flowAmplitude} onChange={(event) => updateParticleTuning("flowAmplitude", Number(event.target.value))} /><ParameterNote name="flowAmplitude" /></label>
          <label>深度强度 <output>{particleTuning.depthStrength.toFixed(0)}</output><input type="range" min="0" max="100" step="1" value={particleTuning.depthStrength} onChange={(event) => updateParticleTuning("depthStrength", Number(event.target.value))} /><ParameterNote name="depthStrength" /></label>
          <label>深度波 <output>{particleTuning.depthWave.toFixed(1)}</output><input type="range" min="0" max="10" step="0.1" value={particleTuning.depthWave} onChange={(event) => updateParticleTuning("depthWave", Number(event.target.value))} /><ParameterNote name="depthWave" /></label>
          <label>回弹强度 <output>{particleTuning.homeSpring.toFixed(3)}</output><input type="range" min="0.005" max="0.15" step="0.005" value={particleTuning.homeSpring} onChange={(event) => updateParticleTuning("homeSpring", Number(event.target.value))} /><ParameterNote name="homeSpring" /></label>
          <label>速度阻尼 <output>{particleTuning.velocityDamping.toFixed(2)}</output><input type="range" min="0.8" max="0.99" step="0.01" value={particleTuning.velocityDamping} onChange={(event) => updateParticleTuning("velocityDamping", Number(event.target.value))} /><ParameterNote name="velocityDamping" /></label>
          <label>噪声强度 <output>{particleTuning.noiseStrength.toFixed(1)}</output><input type="range" min="0" max="10" step="0.1" value={particleTuning.noiseStrength} onChange={(event) => updateParticleTuning("noiseStrength", Number(event.target.value))} /><ParameterNote name="noiseStrength" /></label>
          <label>噪声频率 <output>{particleTuning.noiseFrequency.toFixed(2)}</output><input type="range" min="0.1" max="5" step="0.05" value={particleTuning.noiseFrequency} onChange={(event) => updateParticleTuning("noiseFrequency", Number(event.target.value))} /><ParameterNote name="noiseFrequency" /></label>
          <label>风向 X <output>{particleTuning.windX.toFixed(2)}</output><input type="range" min="-1" max="1" step="0.01" value={particleTuning.windX} onChange={(event) => updateParticleTuning("windX", Number(event.target.value))} /><ParameterNote name="windX" /></label>
          <label>风向 Y <output>{particleTuning.windY.toFixed(2)}</output><input type="range" min="-1" max="1" step="0.01" value={particleTuning.windY} onChange={(event) => updateParticleTuning("windY", Number(event.target.value))} /><ParameterNote name="windY" /></label>
          <label>鼠标力场 <output>{interactionStrength.toFixed(2)}</output><input type="range" min="0" max="2" step="0.05" value={interactionStrength} onChange={(event) => setInteractionStrength(Number(event.target.value))} /><ParameterNote name="interactionStrength" /></label>
          <label>鼠标半径 <output>{particleTuning.mouseRadius.toFixed(0)}px</output><input type="range" min="20" max="240" step="2" value={particleTuning.mouseRadius} onChange={(event) => updateParticleTuning("mouseRadius", Number(event.target.value))} /><ParameterNote name="mouseRadius" /></label>
          <label>涡流强度 <output>{particleTuning.mouseSwirl.toFixed(2)}</output><input type="range" min="0" max="2" step="0.02" value={particleTuning.mouseSwirl} onChange={(event) => updateParticleTuning("mouseSwirl", Number(event.target.value))} /><ParameterNote name="mouseSwirl" /></label>
          <label>波谷横向推力 <output>{particleTuning.mouseRepulsion.toFixed(2)}</output><input type="range" min="0" max="2" step="0.02" value={particleTuning.mouseRepulsion} onChange={(event) => updateParticleTuning("mouseRepulsion", Number(event.target.value))} /><ParameterNote name="mouseRepulsion" /></label>
          <label>波谷深度 <output>{particleTuning.mouseDepthPull.toFixed(2)}</output><input type="range" min="0" max="2" step="0.02" value={particleTuning.mouseDepthPull} onChange={(event) => updateParticleTuning("mouseDepthPull", Number(event.target.value))} /><ParameterNote name="mouseDepthPull" /></label>

          <div className={styles.settingsSectionLabel}><span>色彩与材质</span></div>
          <label>对比度 <output>{particleTuning.contrast.toFixed(1)}</output><input type="range" min="0.7" max="2.2" step="0.1" value={particleTuning.contrast} onChange={(event) => updateParticleTuning("contrast", Number(event.target.value))} /><ParameterNote name="contrast" /></label>
          <label>色相漂移 <output>{particleTuning.hueDrift.toFixed(0)}°</output><input type="range" min="0" max="360" step="1" value={particleTuning.hueDrift} onChange={(event) => updateParticleTuning("hueDrift", Number(event.target.value))} /><ParameterNote name="hueDrift" /></label>
          <label>色彩漂移速度 <output>{particleTuning.colorShiftSpeed.toFixed(1)}</output><input type="range" min="0" max="5" step="0.1" value={particleTuning.colorShiftSpeed} onChange={(event) => updateParticleTuning("colorShiftSpeed", Number(event.target.value))} /><ParameterNote name="colorShiftSpeed" /></label>
          <label>亮度乘数 <output>{particleTuning.luminanceMultiplier.toFixed(1)}</output><input type="range" min="1" max="5" step="0.1" value={particleTuning.luminanceMultiplier} onChange={(event) => updateParticleTuning("luminanceMultiplier", Number(event.target.value))} /><ParameterNote name="luminanceMultiplier" /></label>
          <label>高光增益 <output>{particleTuning.highlightGain.toFixed(1)}</output><input type="range" min="0.5" max="3" step="0.1" value={particleTuning.highlightGain} onChange={(event) => updateParticleTuning("highlightGain", Number(event.target.value))} /><ParameterNote name="highlightGain" /></label>
          <label>光晕强度 <output>{particleTuning.bloomStrength.toFixed(2)}</output><input type="range" min="0" max="2.5" step="0.05" value={particleTuning.bloomStrength} onChange={(event) => updateParticleTuning("bloomStrength", Number(event.target.value))} /><ParameterNote name="bloomStrength" /></label>

          <div className={styles.settingsSectionLabel}><span>音频律动</span></div>
          <div className={styles.settingsAudioActions}>
            <button onClick={() => musicInputRef.current?.click()}>上传音乐</button>
            <button onClick={() => replyState === "listening" ? void stopListening(false) : void beginListening()}>{replyState === "listening" ? "关闭麦克风" : "麦克风输入"}</button>
          </div>
          <label>律动总强度 <output>{particleTuning.rhythmIntensity.toFixed(1)}</output><input type="range" min="0" max="10" step="0.1" value={particleTuning.rhythmIntensity} onChange={(event) => updateParticleTuning("rhythmIntensity", Number(event.target.value))} /><ParameterNote name="rhythmIntensity" /></label>
          <label>舞动幅度 <output>{particleTuning.danceStrength.toFixed(1)}</output><input type="range" min="0" max="10" step="0.1" value={particleTuning.danceStrength} onChange={(event) => updateParticleTuning("danceStrength", Number(event.target.value))} /><ParameterNote name="danceStrength" /></label>
          <label>主体音乐律动 <output>{particleTuning.subjectRhythmStrength.toFixed(2)}</output><input type="range" min="0" max="2" step="0.05" value={particleTuning.subjectRhythmStrength} onChange={(event) => updateParticleTuning("subjectRhythmStrength", Number(event.target.value))} /><ParameterNote name="subjectRhythmStrength" /></label>
          <label>音频亮度 <output>{particleTuning.audioBrightnessStrength.toFixed(2)}</output><input type="range" min="0" max="2" step="0.05" value={particleTuning.audioBrightnessStrength} onChange={(event) => updateParticleTuning("audioBrightnessStrength", Number(event.target.value))} /><ParameterNote name="audioBrightnessStrength" /></label>
          <label>音频光晕 <output>{particleTuning.audioBloomStrength.toFixed(2)}</output><input type="range" min="0" max="1.5" step="0.05" value={particleTuning.audioBloomStrength} onChange={(event) => updateParticleTuning("audioBloomStrength", Number(event.target.value))} /><ParameterNote name="audioBloomStrength" /></label>
          <label>低音增益 <output>{particleTuning.bassGain.toFixed(2)}</output><input type="range" min="0" max="3" step="0.05" value={particleTuning.bassGain} onChange={(event) => updateParticleTuning("bassGain", Number(event.target.value))} /><ParameterNote name="bassGain" /></label>
          <label>流动律动 <output>{particleTuning.flowReactStrength.toFixed(2)}</output><input type="range" min="0" max="1.5" step="0.05" value={particleTuning.flowReactStrength} onChange={(event) => updateParticleTuning("flowReactStrength", Number(event.target.value))} /><ParameterNote name="flowReactStrength" /></label>
          <label>深度律动 <output>{particleTuning.depthReactStrength.toFixed(2)}</output><input type="range" min="0" max="1.5" step="0.05" value={particleTuning.depthReactStrength} onChange={(event) => updateParticleTuning("depthReactStrength", Number(event.target.value))} /><ParameterNote name="depthReactStrength" /></label>
          <label>闪烁律动 <output>{particleTuning.sparkleReactStrength.toFixed(2)}</output><input type="range" min="0" max="1" step="0.02" value={particleTuning.sparkleReactStrength} onChange={(event) => updateParticleTuning("sparkleReactStrength", Number(event.target.value))} /><ParameterNote name="sparkleReactStrength" /></label>
          <label>音频噪声门 <output>{particleTuning.audioNoiseGate.toFixed(2)}</output><input type="range" min="0" max="0.3" step="0.01" value={particleTuning.audioNoiseGate} onChange={(event) => updateParticleTuning("audioNoiseGate", Number(event.target.value))} /><ParameterNote name="audioNoiseGate" /></label>
          <label>动态曲线 <output>{particleTuning.audioDynamicCurve.toFixed(2)}</output><input type="range" min="0.3" max="1.5" step="0.02" value={particleTuning.audioDynamicCurve} onChange={(event) => updateParticleTuning("audioDynamicCurve", Number(event.target.value))} /><ParameterNote name="audioDynamicCurve" /></label>
          <label>亮起速度 <output>{particleTuning.audioAttack.toFixed(3)}s</output><input type="range" min="0.01" max="0.3" step="0.005" value={particleTuning.audioAttack} onChange={(event) => updateParticleTuning("audioAttack", Number(event.target.value))} /><ParameterNote name="audioAttack" /></label>
          <label>回落速度 <output>{particleTuning.audioRelease.toFixed(2)}s</output><input type="range" min="0.05" max="1" step="0.01" value={particleTuning.audioRelease} onChange={(event) => updateParticleTuning("audioRelease", Number(event.target.value))} /><ParameterNote name="audioRelease" /></label>
          <label>律动映射目标
            <select value={particleTuning.reactTarget} onChange={(event) => updateParticleTuning("reactTarget", event.target.value as ParticleTuning["reactTarget"])}>
              <option value="peel">边缘剥离</option><option value="size">粒子大小</option><option value="diffusion">扩散范围</option><option value="noise">噪声速度</option><option value="hue">色相</option>
            </select>
            <ParameterNote name="reactTarget" />
          </label>
          <label>音频平滑度 <output>{particleTuning.audioSmoothing.toFixed(2)}</output><input type="range" min="0.1" max="0.99" step="0.01" value={particleTuning.audioSmoothing} onChange={(event) => updateParticleTuning("audioSmoothing", Number(event.target.value))} /><ParameterNote name="audioSmoothing" /></label>
          <p className={styles.settingsHint}>总音量控制亮度呼吸；低音推动深度与流动；高音只增加少量星光。亮起和回落分别平滑，强拍也不会突然过曝。</p>

          <div className={styles.settingsSectionLabel}><span>会话</span></div>
          <label>AI 模型<select value={provider} onChange={(event) => setProvider(event.target.value)}>{providerOptions.map((option) => <option key={option.provider} value={option.provider} disabled={providerMode === "live" && !option.configured}>{providerLabel(option.provider)}{providerMode === "live" && !option.configured ? " · 未配置密钥" : ""}</option>)}</select></label>
          <label>语音风格<select value={voiceStyle} onChange={(event) => setVoiceStyle(event.target.value)}><option value="intimate">温柔陪伴</option><option value="reflective">安静沉思</option><option value="bright">轻盈温暖</option></select></label>
          <label className={styles.toggleRow}><span><b>允许 AI 理解图片</b><small>仅在你同意后发送压缩副本。</small></span><input type="checkbox" checked={visionEnabled} onChange={(event) => setVisionEnabled(event.target.checked)} /></label>
          <label className={styles.toggleRow}><span><b>在本设备保存我的语音</b><small>每轮语音不会上传到云端存储。</small></span><input type="checkbox" checked={saveVoice} onChange={(event) => setSaveVoice(event.target.checked)} /></label>

          {view === "conversation" && activeGardenItem && (
            <>
              <div className={styles.settingsSectionLabel}><span>当前记忆</span></div>
              <div className={styles.settingsDanger}>
                <button
                  type="button"
                  onClick={() => {
                    setSettingsOpen(false);
                    setDeleteTarget({ kind: "garden", item: activeGardenItem });
                  }}
                >
                  删除当前记忆
                </button>
                <small>粒子图像及其关联的已保存对话会一并移除。</small>
              </div>
            </>
          )}
        </aside>
      )}

      <input ref={fileInputRef} className={styles.hiddenInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; if (file) void handleImageUpload(file); }} />
      <input ref={musicInputRef} className={styles.hiddenInput} type="file" accept=".mp3,.flac,audio/mpeg,audio/flac,audio/x-flac" multiple onChange={(event) => { const files = event.target.files; if (files?.length) handleMusicUpload(files); event.currentTarget.value = ""; }} />
      {musicUrl && (
        <audio
          className={styles.hiddenAudio}
          ref={musicAudioRef}
          src={musicUrl}
          loop
          onPlay={() => { setMusicPlaying(true); startMusicAnalysis(); }}
          onPause={() => { setMusicPlaying(false); stopMusicAnalysis(); }}
          onEnded={() => { setMusicPlaying(false); stopMusicAnalysis(); }}
          onError={() => { setMusicPlaying(false); stopMusicAnalysis(); flashNotice("无法播放这个音乐文件。"); }}
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
  const title = session.summary?.title.original ?? "已保存的对话";
  const summary = session.summary?.abstract.original ?? "这段对话在摘要生成前就已保存。";
  return {
    id: session.id,
    gardenItemId: session.gardenItemId,
    imageUrl,
    title,
    summary,
    diary: session.summary?.diary?.body.original,
    date: date.toLocaleDateString("zh-CN", { month: "long", day: "2-digit", year: "numeric" }),
    time: date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
    duration: formatClock(Math.max(1, Math.round(session.durationMs / 1000))),
    pinnedDate: session.pinnedDate,
    turns: session.turns.map((turn) => ({
      id: turn.id,
      role: turn.role === "user" ? "user" : "assistant",
      original: turn.text.original,
      language: turn.text.originalLanguage,
      createdAt: turn.offsetStartMs,
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
    reader.onerror = () => reject(reader.error ?? new Error("无法读取图片。"));
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
      <div className={styles.calendarNav}><button onClick={() => onMonth(new Date(year, monthIndex - 1, 1))}>‹</button><h2>{month.toLocaleDateString("zh-CN", { month: "long", year: "numeric" })}</h2><button onClick={() => onMonth(new Date(year, monthIndex + 1, 1))}>›</button></div>
      <div className={styles.weekdays}>{["日", "一", "二", "三", "四", "五", "六"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
      <div className={styles.calendarGrid}>
        {cells.map((day, index) => {
          if (!day) return <span key={`blank-${index}`} />;
          const key = `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
          const count = counts[key] ?? 0;
          return <button key={key} className={selectedDate === key ? styles.daySelected : ""} onClick={() => onSelect(key)}><span>{day}</span>{count > 0 && <i>{Array.from({ length: Math.min(3, count) }, (_, dot) => <b key={dot} />)}{count > 3 && <small>+</small>}</i>}</button>;
        })}
      </div>
      <p>{selectedDate ? `已固定 ${counts[selectedDate] ?? 0} 段记忆 · 选择日期可固定最新记忆` : "请选择日期"}</p>
    </article>
  );
}
