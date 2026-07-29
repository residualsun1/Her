import {
  getChatProvider,
  invalidRequest,
  type ChatMessage,
  type ImageContext,
} from "@/app/lib/providers";
import {
  errorResponse,
  optionalString,
  readJsonObject,
  requireString,
  sseResponse,
} from "../_shared/route-utils";

export const runtime = "edge";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonObject(request);
    const provider = getChatProvider(body.provider);
    const input = {
      message: requireString(body.message, "message"),
      history: normalizeHistory(body.history),
      imageContext: normalizeImageContext(body.imageContext),
      replyLanguage: "zh",
    };
    if (body.stream === true) return sseResponse(provider.streamChat(input));
    return Response.json(await provider.completeChat(input), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function normalizeHistory(value: unknown): ChatMessage[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw invalidRequest("history must be an array.");
  return value.slice(-30).map((item, index) => {
    if (!item || typeof item !== "object") {
      throw invalidRequest(`history[${index}] must be an object.`);
    }
    const record = item as Record<string, unknown>;
    if (!(["system", "user", "assistant"] as unknown[]).includes(record.role)) {
      throw invalidRequest(`history[${index}].role is invalid.`);
    }
    return {
      role: record.role as ChatMessage["role"],
      text: requireString(
        record.text ?? record.content,
        `history[${index}].text`,
        12_000,
      ),
      language: optionalString(record.language, `history[${index}].language`, 20),
    };
  });
}

function normalizeImageContext(
  value: unknown,
): Pick<
  ImageContext,
  "description" | "objects" | "atmosphereHypotheses" | "possibleTopics" | "openingQuestion"
> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidRequest("imageContext must be an object.");
  }
  const record = value as Record<string, unknown>;
  return {
    description: requireString(record.description, "imageContext.description", 2_000),
    objects: stringArray(record.objects),
    atmosphereHypotheses: atmosphereHypothesisArray(
      record.atmosphereHypotheses ?? record.mood,
    ),
    possibleTopics: stringArray(record.possibleTopics),
    openingQuestion:
      optionalString(record.openingQuestion, "imageContext.openingQuestion", 1_000) ??
      "这只是对画面氛围的一种猜测，你愿意告诉我当时真实的感受吗？",
  };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function atmosphereHypothesisArray(
  value: unknown,
): ImageContext["atmosphereHypotheses"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string" && item.trim()) {
        return {
          label: item.trim(),
          evidence: "来自画面整体氛围的低置信度线索。",
          confidence: "low" as const,
        };
      }
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const label =
        optionalString(record.label, "imageContext.atmosphereHypotheses.label", 100) ??
        "";
      if (!label) return null;
      const confidence =
        record.confidence === "high" || record.confidence === "medium"
          ? record.confidence
          : "low";
      return {
        label,
        evidence:
          optionalString(
            record.evidence,
            "imageContext.atmosphereHypotheses.evidence",
            500,
          ) ?? "来自画面整体氛围的低置信度线索。",
        confidence,
      };
    })
    .filter(
      (
        item,
      ): item is ImageContext["atmosphereHypotheses"][number] => item !== null,
    )
    .slice(0, 5);
}
