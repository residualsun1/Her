import { getImageContextProvider, type ImageDescriptor } from "@/app/lib/providers";
import {
  errorResponse,
  optionalString,
  readJsonObject,
} from "../_shared/route-utils";

export const runtime = "edge";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonObject(request);
    if (body.consent !== true) {
      return Response.json(
        {
          error: {
            code: "IMAGE_CONSENT_REQUIRED",
            message: "Explicit consent is required before an image can be sent to an AI provider.",
          },
        },
        { status: 400 },
      );
    }
    if (!body.image || typeof body.image !== "object" || Array.isArray(body.image)) {
      return Response.json(
        { error: { code: "INVALID_REQUEST", message: "image must be an object." } },
        { status: 400 },
      );
    }
    const image = body.image as Record<string, unknown>;
    const descriptor: ImageDescriptor = {
      name: optionalString(image.name, "image.name", 255),
      mimeType: optionalString(image.mimeType, "image.mimeType", 100),
      sizeBytes: finiteNumber(image.sizeBytes),
      width: finiteNumber(image.width),
      height: finiteNumber(image.height),
      contentBase64: optionalString(image.contentBase64, "image.contentBase64", 8_000_000),
    };
    const provider = getImageContextProvider(body.provider);
    const result = await provider.analyzeImage({
      image: descriptor,
      language: optionalString(body.language, "language", 20),
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}
