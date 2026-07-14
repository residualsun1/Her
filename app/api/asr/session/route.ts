import { getAsrProvider } from "@/app/lib/providers";
import {
  errorResponse,
  optionalString,
  readJsonObject,
} from "../../_shared/route-utils";

export const runtime = "edge";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonObject(request);
    const result = await getAsrProvider(body.provider).createAsrSession({
      language: optionalString(body.language, "language", 20) ?? "auto",
      sampleRateHz:
        typeof body.sampleRateHz === "number" && body.sampleRateHz > 0
          ? body.sampleRateHz
          : 16_000,
      encoding:
        body.encoding === "pcm16" ||
        body.encoding === "opus" ||
        body.encoding === "webm-opus"
          ? body.encoding
          : "webm-opus",
      interimResults: body.interimResults !== false,
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
