import type {
  AsrProvider,
  AsrSessionInput,
  AsrSessionMetadata,
  ChatInput,
  ChatProvider,
  ChatResult,
  ChatStreamEvent,
  ImageContext,
  ImageContextInput,
  ImageContextProvider,
  MemorySummary,
  MemorySummaryInput,
  MemorySummaryProvider,
  ProviderName,
  TtsProvider,
  TtsSynthesisResult,
  TtsStatus,
} from "./types";
import { ProviderError } from "./errors";

const MOCK_MODEL = "her-deterministic-mock-v1";

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pick<T>(items: readonly T[], seed: string): T {
  return items[hashText(seed) % items.length];
}

function isChineseLanguage(language: string | undefined): boolean {
  return Boolean(language?.toLowerCase().startsWith("zh"));
}

function compactText(value: string, maxLength = 120): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
}

const EN_CHAT_LINES = [
  "Some memories arrive before we know what they are trying to tell us. What does this one bring back for you?",
  "It feels quiet, but not empty. Which detail in this memory still feels alive to you?",
  "Stay with that feeling for a moment. If this image could keep one sound, what would you want it to remember?",
  "There is something gentle in the way you described it. Were you already nostalgic when you captured it?",
] as const;

const ZH_CHAT_LINES = [
  "有些记忆会先抵达，而我们过一会儿才明白它想说什么。这一幕让你想起了什么？",
  "它很安静，但并不空。画面中的哪个细节，对你来说依然是鲜活的？",
  "先和这种感觉待一会儿吧。如果这张图片可以留住一种声音，你希望它记住什么？",
  "你描述它时有一种很轻的温柔。拍下它的时候，你已经开始怀念了吗？",
] as const;

function mockMeta(provider: ProviderName) {
  return { provider, model: MOCK_MODEL, mock: true as const };
}

export class MockProvider
  implements
    ImageContextProvider,
    AsrProvider,
    ChatProvider,
    TtsProvider,
    MemorySummaryProvider
{
  constructor(readonly provider: ProviderName) {}

  async analyzeImage(input: ImageContextInput): Promise<ImageContext> {
    const seed = `${input.image.name ?? "memory"}:${input.image.width ?? 0}:${input.image.height ?? 0}`;
    const descriptions = isChineseLanguage(input.language)
      ? [
          "一段被深色粒子场包围的安静记忆，光线柔和，主体仍然清晰。",
          "一幅带有夜色与微光的私人场景，边缘像记忆一样逐渐消散。",
          "画面中的主体停留在黑暗与细碎光点之间，气氛亲密而克制。",
        ]
      : [
          "A quiet memory held inside a dark particle field, softly lit with a recognizable center.",
          "A private scene shaped by night and scattered light, with edges that dissolve like memory.",
          "The subject rests between darkness and small points of light, intimate and restrained.",
        ];
    return {
      ...mockMeta(this.provider),
      description: pick(descriptions, seed),
      objects: ["memory subject", "soft light", "dark background"],
      mood: ["intimate", "reflective", "quiet"],
      dominantColors: ["midnight black", "cool blue", "soft silver"],
      possibleTopics: ["memory", "time", "the sound of this moment"],
    };
  }

  async createAsrSession(input: AsrSessionInput): Promise<AsrSessionMetadata> {
    const seed = `${input.language ?? "auto"}:${input.sampleRateHz ?? 16000}:${input.encoding ?? "webm-opus"}`;
    return {
      ...mockMeta(this.provider),
      sessionId: `mock-asr-${hashText(seed).toString(16).padStart(8, "0")}`,
      status: "mock-ready",
      transport: "browser-mock",
      sampleRateHz: input.sampleRateHz ?? 16000,
      encoding: input.encoding ?? "webm-opus",
      interimResults: input.interimResults ?? true,
      supportedLanguages: ["en", "zh", "auto"],
    };
  }

  async completeChat(input: ChatInput): Promise<ChatResult> {
    const language = input.replyLanguage ?? "en";
    const lines = isChineseLanguage(language) ? ZH_CHAT_LINES : EN_CHAT_LINES;
    const contextSeed = input.imageContext?.description ?? "";
    const text = pick(lines, `${input.message}:${contextSeed}`);
    return { ...mockMeta(this.provider), text };
  }

  async *streamChat(input: ChatInput): AsyncIterable<ChatStreamEvent> {
    const result = await this.completeChat(input);
    yield {
      type: "meta",
      provider: result.provider,
      model: result.model,
      mock: result.mock,
    };
    const chunks = result.text.match(/.{1,18}(?:\s|$)|.{1,18}/gu) ?? [result.text];
    for (const text of chunks) yield { type: "delta", text };
    yield { type: "done", text: result.text };
  }

  async getTtsStatus(): Promise<TtsStatus> {
    return {
      ...mockMeta(this.provider),
      ready: false,
      streaming: false,
      syntheticVoiceDisclosureRequired: true,
      reason:
        "Voice profiles are available for UI prototyping, but the deterministic mock does not fabricate audio.",
      voices: [
        {
          id: "intimate",
          label: "Intimate",
          languages: ["en", "zh"],
          style: "intimate",
          previewAvailable: false,
        },
        {
          id: "reflective",
          label: "Reflective",
          languages: ["en", "zh"],
          style: "reflective",
          previewAvailable: false,
        },
        {
          id: "bright",
          label: "Bright",
          languages: ["en", "zh"],
          style: "bright",
          previewAvailable: false,
        },
      ],
    };
  }

  async synthesizeSpeech(): Promise<TtsSynthesisResult> {
    throw new ProviderError({
      code: "MOCK_TTS_HAS_NO_AUDIO",
      message: "The deterministic mock does not fabricate synthesized audio.",
      status: 501,
      capability: "tts",
      provider: this.provider,
      hint: "Connect a tested live TTS adapter or use an explicitly labeled browser speech fallback.",
    });
  }

  async summarizeMemory(input: MemorySummaryInput): Promise<MemorySummary> {
    const spoken = input.turns
      .filter((turn) => turn.text.trim())
      .map((turn) => `${turn.role === "user" ? "You" : "AI"}: ${compactText(turn.text, 90)}`);
    const language = input.language ?? "en";
    const chinese = isChineseLanguage(language);
    const firstUser = input.turns.find((turn) => turn.role === "user")?.text;
    const seed = spoken.join("|") || "quiet memory";
    const title = chinese
      ? pick(["留在微光里的话", "一段安静的记忆", "在粒子消散以前"], seed)
      : pick(["Before the Light Faded", "A Quiet Memory", "What the Image Kept"], seed);
    const excerpt = compactText(firstUser ?? (chinese ? "一次安静的交谈" : "a quiet conversation"), 80);
    const summary = chinese
      ? `这段对话围绕“${excerpt}”展开，保留了用户与 AI 的原始表达。`
      : `This conversation stayed close to “${excerpt}” and preserves what the user and AI actually said.`;
    const diary =
      input.includeDiary === false
        ? undefined
        : chinese
          ? `今天，我保存了一段对话。\n\n${spoken.join("\n\n") || "这是一段尚未写入内容的演示记忆。"}`
          : `Today, I saved a conversation.\n\n${spoken.join("\n\n") || "This is an empty demo memory."}`;
    return {
      ...mockMeta(this.provider),
      title,
      summary,
      moodTags: chinese ? ["安静", "回望", "亲密"] : ["quiet", "reflective", "intimate"],
      diary,
    };
  }

}
