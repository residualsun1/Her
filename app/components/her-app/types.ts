export type View = "conversation" | "garden" | "memory" | "music";
export type MemoryTab = "cards" | "calendar";
export type ReplyState =
  | "idle"
  | "listening"
  | "holding"
  | "thinking"
  | "speaking"
  | "ready";

export type ProviderOption = {
  provider: string;
  configured: boolean;
  liveAdapterImplemented: boolean;
};

export type ProviderCapability = {
  capability: string;
  provider: string;
  mode: "mock" | "live";
  configured: boolean;
  model: string | null;
};

export type AtmosphereHypothesis = {
  label: string;
  evidence: string;
  confidence: "low" | "medium" | "high";
};

export type ClientImageContext = {
  description: string;
  objects: string[];
  atmosphereHypotheses: AtmosphereHypothesis[];
  dominantColors: string[];
  possibleTopics: string[];
  openingQuestion: string;
  provider?: string;
  model?: string;
};

export type ChatTurn = {
  id: string;
  role: "user" | "assistant";
  original: string;
  language: "en" | "zh";
  createdAt: number;
  audioBlob?: Blob;
  speakerName?: string;
};

export type MemoryCard = {
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

export type MusicTrack = {
  id: string;
  name: string;
  url: string;
};

export type PreparedSpeechAudio =
  | { kind: "buffered"; blob: Blob }
  | {
      kind: "pcm-stream";
      stream: ReadableStream<Uint8Array>;
      sampleRate: number;
    };

export type SpeechRecognitionResultLike = {
  0: { transcript: string };
  isFinal: boolean;
};

export type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: {
        results: ArrayLike<SpeechRecognitionResultLike>;
      }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export type GardenVisualItem = {
  id: string;
  title: string;
  imageUrl: string;
  precomposed?: boolean;
  imageContext?: ClientImageContext;
};

export type DeleteTarget =
  | { kind: "garden"; item: GardenVisualItem }
  | { kind: "memory"; card: MemoryCard };
