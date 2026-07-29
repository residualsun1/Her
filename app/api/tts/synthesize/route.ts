import { getTtsProvider } from "@/app/lib/providers";
import {
  errorResponse,
  optionalString,
  readJsonObject,
  requireString,
} from "../../_shared/route-utils";

export const runtime = "edge";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonObject(request);
    const text = requireString(body.text, "text", 2_000);
    const voiceId = optionalString(body.voiceId, "voiceId", 40) ?? "intimate";
    const language = optionalString(body.language, "language", 20) ?? "zh";
    const provider = optionalString(body.provider, "provider", 40);
    const result = await getTtsProvider(provider).synthesizeSpeech({
      text,
      voiceId,
      language,
      format: "wav",
    });
    return new Response(result.audio, {
      status: 200,
      headers: {
        "Content-Type": result.mimeType,
        "Cache-Control": "private, no-store",
        "X-Her-TTS-Provider": result.provider,
        "X-Her-TTS-Model": result.model,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
