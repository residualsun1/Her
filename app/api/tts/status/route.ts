import { getTtsProvider } from "@/app/lib/providers";
import { errorResponse } from "../../_shared/route-utils";

export const runtime = "edge";

export async function GET(request: Request): Promise<Response> {
  try {
    const requested = new URL(request.url).searchParams.get("provider") ?? undefined;
    const result = await getTtsProvider(requested).getTtsStatus();
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
