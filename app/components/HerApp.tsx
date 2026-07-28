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
  SessionRecord,
  Turn as StoredTurn,
} from "@/app/lib/memory/types";
import styles from "./HerApp.module.css";

const ParticleGarden = lazy(() => import("./ParticleGarden"));

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

type DeleteTarget =
  | { kind: "garden"; item: GardenVisualItem }
  | { kind: "memory"; card: MemoryCard };

const HIDDEN_SAMPLE_GARDEN_KEY = "her-hidden-sample-garden";
const HIDDEN_SAMPLE_CARDS_KEY = "her-hidden-sample-cards";

const averageFrequencyBand = (data: Uint8Array, start: number, end: number) => {
  const from = Math.max(0, Math.min(start, data.length));
  const to = Math.max(from + 1, Math.min(end, data.length));
  let total = 0;
  for (let index = from; index < to; index += 1) total += data[index];
  return total / (to - from) / 255;
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
  { id: "winter-light", title: "Light in winter", imageUrl: "/demo/light-in-winter.jpg", precomposed: true },
  { id: "blue-rain", title: "Blue rain", imageUrl: "/demo/dark-blue.jpg", precomposed: true },
  { id: "deep-blue", title: "Deep blue", imageUrl: "/demo/deep-blue.jpg", precomposed: true },
  { id: "miss-you", title: "I miss you", imageUrl: "/demo/miss-you.jpg", precomposed: true },
];

const SAMPLE_CARDS: MemoryCard[] = [
  {
    id: "sample-melancholy",
    imageUrl: "/demo/light-in-winter.jpg",
    title: "Light in winter",
    summary:
      "A warm lamp in fresh snow opened a small conversation about winter, returning home, and the comfort of being remembered.",
    date: "Dec 04, 2025",
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
    imageUrl: "/demo/deep-blue.jpg",
    title: "Deep blue",
    summary:
      "A field under a star-filled sky became a map: not of where you went, but of the quiet distance you were willing to cross.",
    date: "Nov 30, 2025",
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
    imageUrl: "/demo/dark-blue.jpg",
    title: "Blue rain",
    summary:
      "Four synthetic voices met briefly in the rain and wondered whether a familiar road can remember who once walked it.",
    date: "Dec 03, 2025",
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
  const [imageTitle, setImageTitle] = useState("Light in winter");
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
    description: "A warm street lamp glows in a quiet winter snowfall.",
    possibleTopics: ["winter nights", "home", "a light left on for someone"],
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
  const [cards, setCards] = useState<MemoryCard[]>(SAMPLE_CARDS);
  const [cardIndex, setCardIndex] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [conversationFromGarden, setConversationFromGarden] = useState(false);
  const [conversationChromeVisible, setConversationChromeVisible] = useState(true);
  const [immersiveMode, setImmersiveMode] = useState(false);
  const [particleZoom, setParticleZoom] = useState(1);
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
  const lastAudioUiUpdateRef = useRef(0);
  const salonRunRef = useRef(0);
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
  const currentSalonLine = salonLineIndex >= 0 ? salonLines[salonLineIndex] : null;
  const currentSalonRole = SALON_ROLES.find((role) => role.id === currentSalonLine?.speakerId);
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
    const hiddenGardenIds = readHiddenSampleIds(HIDDEN_SAMPLE_GARDEN_KEY);
    const nextGardenItems = [
      ...gardens.map((garden) => ({
        id: garden.id,
        title: garden.title?.original ?? garden.image.filename.replace(/\.[^.]+$/, ""),
        imageUrl: gardenUrls.get(garden.id)!,
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
      if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!immersiveMode) return;
    const exitImmersive = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImmersiveMode(false);
    };
    window.addEventListener("keydown", exitImmersive);
    return () => window.removeEventListener("keydown", exitImmersive);
  }, [immersiveMode]);

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
        date: now.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
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
        date: now.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
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
    if (audio.paused) await audio.play().catch(() => flashNotice("This browser needs one more tap to start audio."));
    else audio.pause();
  };

  const handleGardenPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
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
    setImageUrl(item.imageUrl);
    setImagePrecomposed(Boolean(item.precomposed));
    setImageTitle(item.title);
    currentGardenIdRef.current = SAMPLE_GARDEN.some((sample) => sample.id === item.id) ? undefined : item.id;
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
  };

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === "garden") {
        const isSample = SAMPLE_GARDEN.some((item) => item.id === deleteTarget.item.id);
        if (isSample) hideSampleId(HIDDEN_SAMPLE_GARDEN_KEY, deleteTarget.item.id);
        else await memoryStore.deleteGardenItem(deleteTarget.item.id, { cascadeSessions: true });
      } else {
        const isSample = SAMPLE_CARDS.some((card) => card.id === deleteTarget.card.id);
        if (isSample) hideSampleId(HIDDEN_SAMPLE_CARDS_KEY, deleteTarget.card.id);
        else await memoryStore.deleteSessionRecord(deleteTarget.card.id);
      }
      setDeleteTarget(null);
      await refreshSavedCards();
      flashNotice(deleteTarget.kind === "garden" ? "Memory removed from The Garden." : "Memory deleted.");
    } catch {
      flashNotice("This memory could not be deleted yet.");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, deleting, flashNotice, refreshSavedCards]);

  const navigateTo = (nextView: View) => {
    setImmersiveMode(false);
    if (nextView !== "conversation" && (replyState === "listening" || captureStartingRef.current)) {
      void stopListening(false);
    }
    if (nextView !== "salon") {
      salonRunRef.current += 1;
      window.speechSynthesis?.resume();
      setSalonPaused(false);
      stopSpeechPlayback();
    }
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
        <button className={styles.wordmark} onClick={() => navigateTo("conversation")} aria-label="Open conversation">
          <span className={styles.wordmarkDot} /> Her
        </button>
        <nav className={styles.nav} aria-label="Primary navigation">
          <button className={view === "garden" ? styles.navActive : ""} aria-current={view === "garden" ? "page" : undefined} onClick={() => navigateTo("garden")}>The Garden</button>
          <button className={view === "memory" ? styles.navActive : ""} aria-current={view === "memory" ? "page" : undefined} onClick={() => { navigateTo("memory"); setMemoryTab("cards"); }}>Memory</button>
          <button className={view === "salon" ? styles.navActive : ""} aria-current={view === "salon" ? "page" : undefined} onClick={() => navigateTo("salon")}>Ai Salon</button>
          <button className={view === "music" ? styles.navActive : ""} aria-current={view === "music" ? "page" : undefined} onClick={() => navigateTo("music")}>Music</button>
        </nav>
        <button className={styles.iconButton} onClick={() => setSettingsOpen(true)} aria-label="Open settings">
          <span className={styles.tuneIcon}><i /><i /><i /></span>
        </button>
      </header>

      {(view === "conversation" || view === "salon") && (
        <section
          className={`${styles.stage} ${immersiveMode ? styles.immersiveStage : ""}`}
          onWheel={handleParticleWheel}
          aria-label={view === "salon" ? "AI Salon stage" : "Conversation stage"}
        >
          <Suspense fallback={<img className={styles.particleLoading} src={imageUrl} alt="" aria-hidden="true" />}>
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
              onReady={(info) => setParticleInfo(`${info.pointCount.toLocaleString()} particles`)}
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
              aria-label={immersiveMode ? "Show interface" : "Hide interface for immersive view"}
              title={immersiveMode ? "Show interface (Esc)" : "Mouse wheel zooms the particle image"}
            >
              <span className={styles.immersiveIcon} aria-hidden="true" />
              <span>{immersiveMode ? "Show interface" : "Hide interface"}</span>
              <small>{Math.round(particleZoom * 100)}%</small>
            </button>
          )}
          {(view === "salon" || !conversationFromGarden || conversationChromeVisible) && (
            <div className={`${styles.providerPill} ${conversationFromGarden ? styles.delayedChrome : ""}`}>
              <span className={replyState === "speaking" ? styles.liveWave : styles.providerGlyph}>{replyState === "speaking" ? "≋" : "×"}</span>
              <span className={styles.statusDot} />
              <span>{providerMode === "mock" ? "Preview ai" : providerLabel(provider)}</span>
            </div>
          )}

          {view === "conversation" ? (
            (!conversationFromGarden || conversationChromeVisible) && <div className={`${styles.conversationUi} ${conversationFromGarden ? styles.delayedChrome : ""}`}>
              {replyState === "thinking" && <div className={styles.thinking}>the other side is thinking <span>·</span><span>·</span><span>·</span></div>}
              {currentAssistant && (
                <article className={`${styles.replyCard} ${conversationFromGarden ? styles.gardenQuestion : ""} ${replyState === "speaking" ? styles.replySpeaking : ""}`}>
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
                    <span><b className={styles.recordingDot} /> Rec {formatClock(Math.max(1, recordingElapsed))}</span>
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
            </div>
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
                  <span>Ai salon · Late night</span>
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
          {(view === "salon" || !conversationFromGarden || conversationChromeVisible) && <span className={`${styles.particleMeta} ${conversationFromGarden ? styles.delayedChrome : ""}`}>{particleInfo}</span>}
        </section>
      )}

      {view === "garden" && (
        <section className={styles.galleryPage}>
          {gardenItems.length ? (
            <>
              <div
                ref={gardenStripRef}
                className={styles.gardenStrip}
                onPointerDownCapture={handleGardenPointerDown}
                onPointerMoveCapture={handleGardenPointerMove}
                onPointerUpCapture={handleGardenPointerUp}
                onPointerCancelCapture={handleGardenPointerUp}
                onWheel={handleGardenWheel}
                onPointerLeave={() => {
                  if (gardenDragRef.current.pointerId === -1 && gardenCursorRef.current) {
                    gardenCursorRef.current.style.opacity = "0";
                  }
                }}
                aria-label="Memory particles. Drag left or right to explore."
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
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          if (index !== gardenIndex) focusGardenItem(index);
                          else openGardenConversation(item);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open ${item.title}`}
                    >
                      {Math.abs(index - gardenIndex) <= 1 ? (
                        <Suspense fallback={<img className={styles.particleLoading} src={item.imageUrl} alt="" aria-hidden="true" />}>
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
                        className={styles.deleteMemoryButton}
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteTarget({ kind: "garden", item });
                        }}
                        aria-label={`Delete ${item.title}`}
                      >
                        Delete
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
                aria-label="Previous memory"
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
                aria-label="Next memory"
              >
                ›
              </button>
              <div className={styles.gardenDots} aria-label={`${gardenIndex + 1} of ${gardenItems.length}`}>
                {gardenItems.map((item, index) => (
                  <button
                    key={item.id}
                    className={index === gardenIndex ? styles.gardenDotActive : ""}
                    onClick={() => focusGardenItem(index)}
                    aria-label={`Show ${item.title}`}
                    aria-current={index === gardenIndex ? "true" : undefined}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className={styles.emptyState}><span>The garden is quiet</span><p>Upload an image when you are ready to let a memory grow here.</p></div>
          )}
          <button className={styles.uploadMore} onClick={() => fileInputRef.current?.click()}>＋ Upload more</button>
        </section>
      )}

      {view === "memory" && (
        <section className={styles.memoryPage}>
          <div className={styles.memoryHeader}>
            <div><span>Day / night chron</span><h1>You and I have memories,<br />longer than the road ahead.</h1></div>
            <div className={styles.tabSwitch}><button className={memoryTab === "cards" ? styles.tabActive : ""} onClick={() => setMemoryTab("cards")}>Cards</button><button className={memoryTab === "calendar" ? styles.tabActive : ""} onClick={() => setMemoryTab("calendar")}>Calendar</button></div>
          </div>
          {memoryTab === "cards" ? (
            <>
              {cards.length ? <div className={styles.cardCarousel}>
                {cards.map((card, index) => {
                  const offset = index - cardIndex;
                  if (Math.abs(offset) > 2) return null;
                  return (
                    <article key={card.id} className={`${styles.memoryCard} ${offset === 0 ? styles.memoryCardActive : ""}`} style={{ "--card-offset": offset } as CSSProperties} onClick={() => offset !== 0 && setCardIndex(index)}>
                      {offset === 0 && (
                        <button
                          className={styles.cardDeleteButton}
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteTarget({ kind: "memory", card });
                          }}
                          aria-label={`Delete ${card.title}`}
                        >
                          Delete
                        </button>
                      )}
                      <img src={card.imageUrl} alt="Memory cover" />
                      <div className={styles.cardBody}>
                        <h2>{card.title}</h2>
                        <div className={styles.cardMeta}><span>{card.mode === "salon" ? "@Ai salon" : "@You ∩ companion"} · {card.duration}</span><span>{card.date}<br />{card.time}</span></div>
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
              </div> : <div className={styles.emptyState}><span>No saved memories</span><p>Your next saved conversation will appear here.</p></div>}
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
          <div className={styles.musicCopy}><span>Atmosphere</span><h1>Give the memory<br />a room to live in.</h1><p>Import a track from your device. It stays here, and the particles will listen with you.</p></div>
          <div className={styles.musicPlayer}>
            <div><small>Now playing</small><strong>{musicName}</strong></div>
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

      {deleteTarget && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="delete-memory-title">
          <article className={styles.deleteConfirm}>
            <span>Remove memory</span>
            <h2 id="delete-memory-title">Let this memory go?</h2>
            <p>
              {deleteTarget.kind === "garden"
                ? "This particle image and its linked conversations will be removed."
                : "This saved conversation will be removed from Memory."}
            </p>
            <strong>{deleteTarget.kind === "garden" ? deleteTarget.item.title : deleteTarget.card.title}</strong>
            <div>
              <button onClick={() => setDeleteTarget(null)} disabled={deleting}>Keep it</button>
              <button onClick={() => void confirmDelete()} disabled={deleting}>{deleting ? "Removing…" : "Delete"}</button>
            </div>
          </article>
        </div>
      )}

      {settingsOpen && (
        <aside className={styles.settingsPanel} aria-label="设置">
          <div className={styles.settingsTitle}>
            <div><span>Particle field</span><h2>让记忆成为星团。</h2></div>
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
          <label>语音音色<select value={voiceStyle} onChange={(event) => setVoiceStyle(event.target.value)}><option value="intimate">亲密英文</option><option value="reflective">沉思英文</option><option value="bright">明亮英文</option></select></label>
          <label>回复语言<select value={replyLanguage} onChange={(event) => setReplyLanguage(event.target.value as "en" | "zh")}><option value="en">英文优先</option><option value="zh">中文优先</option></select></label>
          <label className={styles.toggleRow}><span><b>允许 AI 理解图片</b><small>仅在你同意后发送压缩副本。</small></span><input type="checkbox" checked={visionEnabled} onChange={(event) => setVisionEnabled(event.target.checked)} /></label>
          <label className={styles.toggleRow}><span><b>在本设备保存我的语音</b><small>每轮语音不会上传到云端存储。</small></span><input type="checkbox" checked={saveVoice} onChange={(event) => setSaveVoice(event.target.checked)} /></label>
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
    date: date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
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
