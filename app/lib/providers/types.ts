export const PROVIDER_NAMES = [
  "deepseek",
  "qwen",
  "openai",
  "anthropic",
  "gemini",
] as const;

export type ProviderName = (typeof PROVIDER_NAMES)[number];
export type ProviderMode = "mock" | "live";
export type Capability =
  | "chat"
  | "image"
  | "asr"
  | "translation"
  | "tts"
  | "summary";

export type SupportedLanguage = "en" | "zh" | "auto" | (string & {});

export interface ProviderMeta {
  provider: ProviderName;
  model: string;
  mock: boolean;
}

export interface ImageDescriptor {
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  /** Reserved for a future live vision adapter. Never echoed in a response. */
  contentBase64?: string;
}

export interface ImageContextInput {
  image: ImageDescriptor;
  language?: SupportedLanguage;
}

export interface ImageContext extends ProviderMeta {
  description: string;
  objects: string[];
  mood: string[];
  dominantColors: string[];
  possibleTopics: string[];
}

export interface ImageContextProvider {
  analyzeImage(input: ImageContextInput): Promise<ImageContext>;
}

export interface AsrSessionInput {
  language?: SupportedLanguage;
  sampleRateHz?: number;
  encoding?: "pcm16" | "opus" | "webm-opus";
  interimResults?: boolean;
}

/**
 * Safe metadata for initiating ASR. It intentionally contains neither API keys
 * nor an implemented provider websocket; live ephemeral-token exchange belongs
 * in a provider-specific adapter added later.
 */
export interface AsrSessionMetadata extends ProviderMeta {
  sessionId: string;
  status: "mock-ready" | "live-ready";
  transport: "browser-mock" | "websocket";
  sampleRateHz: number;
  encoding: "pcm16" | "opus" | "webm-opus";
  interimResults: boolean;
  supportedLanguages: string[];
  expiresInSeconds?: number;
}

export interface AsrProvider {
  createAsrSession(input: AsrSessionInput): Promise<AsrSessionMetadata>;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  text: string;
  language?: SupportedLanguage;
}

export interface ChatInput {
  message: string;
  history?: ChatMessage[];
  imageContext?: Pick<
    ImageContext,
    "description" | "objects" | "mood" | "possibleTopics"
  >;
  replyLanguage?: SupportedLanguage;
}

export interface ChatResult extends ProviderMeta {
  text: string;
}

export type ChatStreamEvent =
  | { type: "meta"; provider: ProviderName; model: string; mock: boolean }
  | { type: "delta"; text: string }
  | { type: "done"; text: string };

export interface ChatProvider {
  completeChat(input: ChatInput): Promise<ChatResult>;
  streamChat(input: ChatInput): AsyncIterable<ChatStreamEvent>;
}

export interface TranslationInput {
  text: string;
  targetLanguage: SupportedLanguage;
  sourceLanguage?: SupportedLanguage;
}

export interface TranslationResult extends ProviderMeta {
  translation: string;
  sourceLanguage: SupportedLanguage;
  targetLanguage: SupportedLanguage;
}

export interface TranslationProvider {
  translate(input: TranslationInput): Promise<TranslationResult>;
}

export interface TtsVoiceProfile {
  id: string;
  label: string;
  languages: string[];
  style: "intimate" | "reflective" | "bright" | "neutral";
  previewAvailable: boolean;
}

export interface TtsStatus extends ProviderMeta {
  ready: boolean;
  streaming: boolean;
  syntheticVoiceDisclosureRequired: true;
  voices: TtsVoiceProfile[];
  reason?: string;
}

export interface TtsSynthesisInput {
  text: string;
  voiceId: string;
  language?: SupportedLanguage;
  format?: "mp3" | "wav" | "pcm16" | "opus";
}

export interface TtsSynthesisResult extends ProviderMeta {
  audio: ReadableStream<Uint8Array>;
  mimeType: string;
  sampleRateHz?: number;
}

export interface TtsProvider {
  getTtsStatus(): Promise<TtsStatus>;
  synthesizeSpeech(input: TtsSynthesisInput): Promise<TtsSynthesisResult>;
}

export interface MemoryTurn {
  role: "user" | "assistant";
  text: string;
  speakerId?: string;
  language?: SupportedLanguage;
  timestampMs?: number;
}

export interface MemorySummaryInput {
  turns: MemoryTurn[];
  language?: SupportedLanguage;
  includeDiary?: boolean;
}

export interface MemorySummary extends ProviderMeta {
  title: string;
  summary: string;
  moodTags: string[];
  diary?: string;
}

export interface MemorySummaryProvider {
  summarizeMemory(input: MemorySummaryInput): Promise<MemorySummary>;
}

export interface CapabilityStatus {
  capability: Capability;
  provider: ProviderName;
  mode: ProviderMode;
  configured: boolean;
  implemented: boolean;
  model: string | null;
  reason?: string;
}

export interface ProviderAvailability {
  provider: ProviderName;
  mode: ProviderMode;
  configured: boolean;
  mockAvailable: true;
  liveAdapterImplemented: boolean;
  liveCapabilities: Capability[];
}
