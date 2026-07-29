import {
  getMemorySummaryProvider,
  invalidRequest,
  type MemoryTurn,
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
    const body = await readJsonObject(request, 2_000_000);
    const provider = getMemorySummaryProvider(body.provider);
    const result = await provider.summarizeMemory({
      turns: normalizeTurns(body.turns),
      language: "zh",
      includeDiary: body.includeDiary !== false,
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

function normalizeTurns(value: unknown): MemoryTurn[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw invalidRequest("turns must be a non-empty array.");
  }
  return value.slice(0, 100).map((item, index) => {
    if (!item || typeof item !== "object") {
      throw invalidRequest(`turns[${index}] must be an object.`);
    }
    const record = item as Record<string, unknown>;
    if (!(["user", "assistant"] as unknown[]).includes(record.role)) {
      throw invalidRequest(`turns[${index}].role is invalid.`);
    }
    return {
      role: record.role as MemoryTurn["role"],
      text: requireString(
        record.text ?? record.textOriginal,
        `turns[${index}].text`,
        12_000,
      ),
      speakerId: optionalString(record.speakerId, `turns[${index}].speakerId`, 80),
      language: optionalString(record.language, `turns[${index}].language`, 20),
      timestampMs:
        typeof record.timestampMs === "number" && record.timestampMs >= 0
          ? record.timestampMs
          : undefined,
    };
  });
}
