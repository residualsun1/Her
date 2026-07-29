import type {
  CalendarDate,
  ImageContext as StoredImageContext,
  SessionRecord,
} from "@/app/lib/memory/types";
import type {
  ClientImageContext,
  MemoryCard,
  SpeechRecognitionResultLike,
} from "./types";

const SPOKEN_CLAUSE_END = /[，。！？；：、,.!?;:]$/u;
const SPOKEN_SENTENCE_END = /[。！？.!?]$/u;
const CHINESE_CHARACTER = /[\u3400-\u9fff]/u;

export const averageFrequencyBand = (
  data: Uint8Array,
  start: number,
  end: number,
) => {
  const from = Math.max(0, Math.min(start, data.length));
  const to = Math.max(from + 1, Math.min(end, data.length));
  let total = 0;
  for (let index = from; index < to; index += 1) total += data[index];
  return total / (to - from) / 255;
};

export const resumeAudioContext = async (
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

export const pad = (value: number) => String(value).padStart(2, "0");

export const formatClock = (seconds: number) =>
  `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;

export const localDateKey = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` as CalendarDate;

export const formatSpeechRecognitionResults = (
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

export const finishSpeechTranscript = (value: string) => {
  const transcript = value.trim();
  if (!transcript) return "";
  if (/[,，]\s*$/u.test(transcript)) {
    return transcript.replace(
      /[,，]\s*$/u,
      CHINESE_CHARACTER.test(transcript) ? "。" : ".",
    );
  }
  if (SPOKEN_SENTENCE_END.test(transcript)) return transcript;
  return `${transcript}${CHINESE_CHARACTER.test(transcript) ? "。" : "."}`;
};

export const storedImageContextToClient = (
  context: StoredImageContext | undefined,
): ClientImageContext | undefined => {
  if (!context) return undefined;
  return {
    description: context.description.original,
    objects: context.observedDetails ?? [],
    atmosphereHypotheses: context.atmosphereHypotheses ?? [],
    dominantColors: context.dominantColors ?? [],
    possibleTopics: (context.possibleTopics ?? []).map(
      (topic) => topic.original,
    ),
    openingQuestion:
      context.openingQuestion?.original ??
      "这幅画面也许留着某种情绪，但我不想替你决定。重新看见它时，你有什么感觉？",
    provider: context.model?.provider,
    model: context.model?.model,
  };
};

export const readHiddenSampleIds = (key: string) => {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return new Set(
      Array.isArray(value)
        ? value.filter((id): id is string => typeof id === "string")
        : [],
    );
  } catch {
    return new Set<string>();
  }
};

export const hideSampleId = (key: string, id: string) => {
  const hidden = readHiddenSampleIds(key);
  hidden.add(id);
  window.localStorage.setItem(key, JSON.stringify([...hidden]));
};

export const providerLabel = (provider: string) =>
  provider === "deepseek"
    ? "DeepSeek"
    : provider === "qwen"
      ? "Qwen"
      : provider === "openai"
        ? "OpenAI"
        : provider === "anthropic"
          ? "Claude"
          : "Gemini";

export function storedSessionToCard(
  session: SessionRecord,
  imageUrl: string,
): MemoryCard {
  const date = new Date(session.createdAt);
  const title = session.summary?.title.original ?? "已保存的对话";
  const summary =
    session.summary?.abstract.original ?? "这段对话在摘要生成前就已保存。";
  return {
    id: session.id,
    gardenItemId: session.gardenItemId,
    imageUrl,
    title,
    summary,
    diary: session.summary?.diary?.body.original,
    date: date.toLocaleDateString("zh-CN", {
      month: "long",
      day: "2-digit",
      year: "numeric",
    }),
    time: date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    }),
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

export function readImageDimensions(
  url: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({ width: 720, height: 900 });
    image.src = url;
  });
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      resolve(value.includes(",") ? value.slice(value.indexOf(",") + 1) : value);
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("无法读取图片。"));
    reader.readAsDataURL(blob);
  });
}
