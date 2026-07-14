import { getTranslationProvider } from "@/app/lib/providers";
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
    const provider = getTranslationProvider(body.provider);
    const result = await provider.translate({
      text: requireString(body.text, "text"),
      targetLanguage: requireString(body.targetLanguage, "targetLanguage", 20),
      sourceLanguage: optionalString(body.sourceLanguage, "sourceLanguage", 20),
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
