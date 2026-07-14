import {
  listCapabilityStatus,
  listProviderAvailability,
} from "@/app/lib/providers";
import { errorResponse } from "../_shared/route-utils";

export const runtime = "edge";

export async function GET(): Promise<Response> {
  try {
    return Response.json(
      {
        capabilities: listCapabilityStatus(),
        providers: listProviderAvailability(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
