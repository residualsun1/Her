/** Cloudflare Worker entry point for Her. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const API_RATE_LIMITS = new Map([
  ["/api/chat", 24],
  ["/api/image-context", 12],
  ["/api/summary", 12],
  ["/api/tts/synthesize", 36],
]);
const requestBuckets = new Map<
  string,
  { count: number; windowStartedAt: number }
>();

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set(
    "Content-Security-Policy",
    "base-uri 'self'; frame-ancestors 'none'; object-src 'none'",
  );
  headers.set(
    "Permissions-Policy",
    "camera=(), geolocation=(), microphone=(self)",
  );
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function rateLimitResponse(request: Request, pathname: string): Response | null {
  if (request.method !== "POST") return null;
  const limit = API_RATE_LIMITS.get(pathname);
  if (!limit) return null;

  const now = Date.now();
  if (requestBuckets.size > 1_000) {
    requestBuckets.forEach((bucket, key) => {
      if (now - bucket.windowStartedAt >= RATE_LIMIT_WINDOW_MS) {
        requestBuckets.delete(key);
      }
    });
  }
  const address =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local";
  const key = `${pathname}:${address}`;
  const current = requestBuckets.get(key);
  const bucket =
    !current || now - current.windowStartedAt >= RATE_LIMIT_WINDOW_MS
      ? { count: 0, windowStartedAt: now }
      : current;
  bucket.count += 1;
  requestBuckets.set(key, bucket);
  if (bucket.count <= limit) return null;

  return withSecurityHeaders(
    Response.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "请求过于频繁，请稍后再试。",
        },
      },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(
            Math.max(
              1,
              Math.ceil(
                (RATE_LIMIT_WINDOW_MS - (now - bucket.windowStartedAt)) / 1_000,
              ),
            ),
          ),
        },
      },
    ),
  );
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const limited = rateLimitResponse(request, url.pathname);
    if (limited) return limited;

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const response = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return withSecurityHeaders(response);
    }

    return withSecurityHeaders(await handler.fetch(request, env, ctx));
  },
};

export default worker;
