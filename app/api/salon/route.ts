import {
  getSceneDirectorProvider,
  invalidRequest,
  type ImageContext,
  type SalonRole,
} from "@/app/lib/providers";
import {
  errorResponse,
  optionalString,
  readJsonObject,
  requireString,
} from "../_shared/route-utils";

export const runtime = "edge";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonObject(request);
    const provider = getSceneDirectorProvider(body.provider);
    const result = await provider.directScene({
      topic: requireString(body.topic, "topic", 500),
      roles: normalizeRoles(body.roles),
      turns:
        typeof body.turns === "number" && Number.isFinite(body.turns)
          ? body.turns
          : undefined,
      language: optionalString(body.language, "language", 20) ?? "en",
      mood: optionalString(body.mood, "mood", 120) ?? "late-night intimate",
      imageContext: normalizeImageContext(body.imageContext),
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

function normalizeImageContext(
  value: unknown,
): Pick<ImageContext, "description" | "possibleTopics"> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidRequest("imageContext must be an object.");
  }
  const record = value as Record<string, unknown>;
  return {
    description: requireString(
      record.description,
      "imageContext.description",
      2_000,
    ),
    possibleTopics: Array.isArray(record.possibleTopics)
      ? record.possibleTopics
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 20)
      : [],
  };
}

function normalizeRoles(value: unknown): Array<SalonRole | string> | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw invalidRequest("roles must be an array.");
  return value.slice(0, 5).map((item, index) => {
    if (typeof item === "string") return item;
    if (!item || typeof item !== "object") {
      throw invalidRequest(`roles[${index}] must be a string or object.`);
    }
    const record = item as Record<string, unknown>;
    return {
      id: requireString(record.id, `roles[${index}].id`, 40),
      name: requireString(record.name, `roles[${index}].name`, 40),
      persona: optionalString(record.persona, `roles[${index}].persona`, 160),
      voiceId: optionalString(record.voiceId, `roles[${index}].voiceId`, 80),
    };
  });
}
