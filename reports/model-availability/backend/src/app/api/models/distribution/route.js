import { NextResponse } from "next/server";
import { getDistribution, setDistribution, DISTRIBUTION_MODES } from "@/lib/distributionDb";
import { buildModelsList } from "@/app/api/v1/models/route.js";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { getProviderConnections } from "@/lib/localDb";
import { routeAvailability } from "@/lib/availability/service.js";

export const dynamic = "force-dynamic";

// GET /api/models/distribution
export async function GET() {
  try {
    const state = await getDistribution();
    const kinds = [...new Set(["llm", ...Object.values(AI_PROVIDERS).flatMap((provider) => provider?.serviceKinds || [])])];
    const catalog = await buildModelsList(kinds, { ignoreDistribution: true, ignoreAvailability: true });
    const availability = await routeAvailability(catalog.map(model => model.id), await getProviderConnections());
    return NextResponse.json({ ...state, modes: DISTRIBUTION_MODES, catalog, availability });
  } catch (error) {
    console.log("Error fetching distribution:", error);
    return NextResponse.json({ error: "Failed to fetch distribution" }, { status: 500 });
  }
}

// PUT /api/models/distribution  body: { mode, models: [...] }
export async function PUT(request) {
  try {
    const body = await request.json();
    if (body?.mode !== undefined && !DISTRIBUTION_MODES.includes(body.mode)) {
      return NextResponse.json({ error: `mode must be one of ${DISTRIBUTION_MODES.join(", ")}` }, { status: 400 });
    }
    if (body?.models !== undefined && !Array.isArray(body.models)) {
      return NextResponse.json({ error: "models must be an array" }, { status: 400 });
    }
    if (body?.models !== undefined && body.models.some((id) => typeof id !== "string")) {
      return NextResponse.json({ error: "models[] must be strings" }, { status: 400 });
    }
    const state = await setDistribution({ mode: body?.mode, models: body?.models });
    return NextResponse.json(state);
  } catch (error) {
    console.log("Error updating distribution:", error);
    return NextResponse.json({ error: "Failed to update distribution" }, { status: 500 });
  }
}
