import { ProviderError, invalidRequest } from "@/app/lib/providers";

export const edgeRuntime = "edge";

export async function readJsonObject(
  request: Request,
  maxBytes = 1_000_000,
): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw invalidRequest(`Request body exceeds the ${maxBytes} byte limit.`);
  }

  let value: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("missing body");
    const decoder = new TextDecoder();
    let receivedBytes = 0;
    let text = "";
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      receivedBytes += chunk.byteLength;
      if (receivedBytes > maxBytes) {
        await reader.cancel();
        throw invalidRequest(
          `Request body exceeds the ${maxBytes} byte limit.`,
        );
      }
      text += decoder.decode(chunk, { stream: true });
    }
    text += decoder.decode();
    value = JSON.parse(text);
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw invalidRequest("Request body must be valid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidRequest("Request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

export function requireString(
  value: unknown,
  field: string,
  maxLength = 12_000,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw invalidRequest(`${field} must be a non-empty string.`);
  }
  if (value.length > maxLength) {
    throw invalidRequest(`${field} exceeds the ${maxLength} character limit.`);
  }
  return value.trim();
}

export function optionalString(
  value: unknown,
  field: string,
  maxLength = 1_000,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requireString(value, field, maxLength);
}

export function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ProviderError) {
    return jsonResponse(
      {
        error: {
          code: error.code,
          message: error.message,
          capability: error.capability,
          provider: error.provider,
          hint: error.hint,
        },
      },
      error.status,
    );
  }
  console.error("Unhandled API error", error);
  return jsonResponse(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "The request could not be completed.",
      },
    },
    500,
  );
}

export function sseResponse(events: AsyncIterable<unknown>): Response {
  const encoder = new TextEncoder();
  const iterator = events[Symbol.asyncIterator]();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) {
          controller.close();
          return;
        }
        const event = next.value as { type?: string };
        const eventName = event.type ?? "message";
        controller.enqueue(
          encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(next.value)}\n\n`),
        );
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ code: "STREAM_ERROR", message: error instanceof Error ? error.message : "Stream failed" })}\n\n`,
          ),
        );
        controller.close();
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
