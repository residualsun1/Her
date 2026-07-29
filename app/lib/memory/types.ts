/**
 * Device-local memory model for the Her demo.
 *
 * Garden items own the visual source and particle configuration. A garden item
 * can have any number of conversation session records. Audio remains
 * in its own object store so large blobs are not copied whenever a session is
 * updated.
 */

export type SupportedLanguage = "en" | "zh";
export type CalendarDate = `${number}-${number}-${number}`;
export type SessionMode = "conversation";
export type SaveStatus = "draft" | "summarizing" | "ready" | "failed";
export type ProviderId =
  | "deepseek"
  | "qwen"
  | "openai"
  | "anthropic"
  | "gemini"
  | "local"
  | (string & {});

export interface BilingualText {
  /** Text exactly as it was spoken or generated. */
  original: string;
  originalLanguage: SupportedLanguage;
  /** Optional English rendering. The original is not duplicated here. */
  en?: string;
  /** Optional Simplified Chinese rendering. The original is not duplicated here. */
  zh?: string;
}
export interface ModelReference {
  provider: ProviderId;
  model: string;
}

export type AtmosphereConfidence = "low" | "medium" | "high";

export interface StoredAtmosphereHypothesis {
  label: string;
  evidence: string;
  confidence: AtmosphereConfidence;
}

export interface ImageCrop {
  /** Normalized focal point, from 0 to 1. */
  x: number;
  /** Normalized focal point, from 0 to 1. */
  y: number;
  zoom: number;
}

export interface GardenImage {
  blob: Blob;
  mimeType: string;
  filename: string;
  width: number;
  height: number;
  /** Hex values used while the full image is being decoded. */
  dominantColors?: string[];
}

export interface ImageContext {
  description: BilingualText;
  observedDetails: string[];
  atmosphereHypotheses: StoredAtmosphereHypothesis[];
  dominantColors: string[];
  possibleTopics: BilingualText[];
  openingQuestion: BilingualText;
  model?: ModelReference;
  /** Image context must never exist unless the user opted in to vision upload. */
  userConsented: true;
}

export interface ParticlePreset {
  presetId: string;
  visualSeed: number;
  particleDensity: number;
  glowIntensity: number;
  trailLength: number;
  hueDrift: number;
  bloomThreshold: number;
}

export interface GardenItem {
  id: string;
  createdAt: string;
  updatedAt: string;
  title?: BilingualText;
  image: GardenImage;
  imageCrop: ImageCrop;
  imageContext?: ImageContext;
  particles: ParticlePreset;
  /** Optional AudioAsset whose ownerType is `music`. */
  musicAssetId?: string;
}

export type TurnRole = "user" | "assistant";

export interface Turn {
  id: string;
  role: TurnRole;
  speakerId?: string;
  text: BilingualText;
  model?: ModelReference;
  /** Milliseconds from the beginning of the session. */
  offsetStartMs: number;
  offsetEndMs?: number;
  audioAssetId?: string;
  interrupted?: boolean;
}

export interface SessionParticipant {
  id: string;
  name: string;
  kind: "user" | "assistant";
  voiceId?: string;
  accent?: string;
}

export interface GeneratedDiary {
  body: BilingualText;
  generatedAt: string;
  model?: ModelReference;
}

export interface SessionSummary {
  title: BilingualText;
  abstract: BilingualText;
  moodTags: string[];
  generatedAt: string;
  model?: ModelReference;
  diary?: GeneratedDiary;
}

interface SessionRecordBase {
  id: string;
  gardenItemId: string;
  createdAt: string;
  updatedAt: string;
  /** A user-assigned memory date. This does not replace createdAt. */
  pinnedDate?: CalendarDate;
  participants: SessionParticipant[];
  turns: Turn[];
  durationMs: number;
  primaryLanguage: SupportedLanguage;
  saveStatus: SaveStatus;
  summary?: SessionSummary;
}

export interface ConversationSessionRecord extends SessionRecordBase {
  mode: "conversation";
}

export type SessionRecord = ConversationSessionRecord;

export type AudioOwnerType =
  | "user_turn"
  | "assistant_turn"
  | "music";

export interface AudioAsset {
  id: string;
  ownerType: AudioOwnerType;
  /** Turn id for speech, GardenItem id for background music. */
  ownerId: string;
  blob: Blob;
  mimeType: string;
  durationMs: number;
  createdAt: string;
  filename?: string;
  sampleRate?: number;
}

export type CreateGardenItemInput = Omit<
  GardenItem,
  "id" | "createdAt" | "updatedAt"
> & {
  id?: string;
  createdAt?: string;
};

export type UpdateGardenItemInput = Partial<
  Omit<GardenItem, "id" | "createdAt" | "updatedAt">
>;

export type CreateConversationSessionInput = Omit<
  ConversationSessionRecord,
  "id" | "createdAt" | "updatedAt"
> & {
  id?: string;
  createdAt?: string;
};

export type CreateSessionRecordInput = CreateConversationSessionInput;

export type UpdateSessionRecordInput = Partial<
  Pick<
    SessionRecordBase,
    | "pinnedDate"
    | "participants"
    | "turns"
    | "durationMs"
    | "primaryLanguage"
    | "saveStatus"
    | "summary"
  >
>;

export type CreateTurnInput = Omit<Turn, "id"> & { id?: string };
export type UpdateTurnInput = Partial<Omit<Turn, "id">>;

export type CreateAudioAssetInput = Omit<AudioAsset, "id" | "createdAt"> & {
  id?: string;
  createdAt?: string;
};

export interface ListOptions {
  sort?: "newest" | "oldest";
  offset?: number;
  limit?: number;
}

export interface ListSessionOptions extends ListOptions {
  gardenItemId?: string;
  mode?: SessionMode;
  pinnedDate?: CalendarDate;
  saveStatus?: SaveStatus;
}

export interface ListAudioOptions extends ListOptions {
  ownerId?: string;
  ownerType?: AudioOwnerType;
}

export interface MemorySeedData {
  gardenItems: GardenItem[];
  sessions: SessionRecord[];
  audioAssets: AudioAsset[];
}

export interface MemorySnapshot extends MemorySeedData {
  exportedAt: string;
}

export function getLocalizedText(
  value: BilingualText,
  language: SupportedLanguage,
): string {
  if (language === value.originalLanguage) return value.original;
  return value[language] ?? value.original;
}
