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
    const streaming = body.stream === true;
    const result = await getTtsProvider(provider).synthesizeSpeech({
      text,
      voiceId,
      language,
      format: streaming ? "pcm16" : "wav",
    });
    return new Response(result.audio, {
      status: 200,
      headers: {
        "Content-Type": result.mimeType,
        "Cache-Control": "private, no-store",
        "X-Her-TTS-Provider": result.provider,
        "X-Her-TTS-Model": result.model,
        "X-Her-TTS-Streaming": streaming ? "1" : "0",
        ...(result.sampleRateHz
          ? { "X-Her-TTS-Sample-Rate": String(result.sampleRateHz) }
          : {}),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
