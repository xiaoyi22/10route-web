import { NextResponse } from "next/server";
import { testSingleConnection } from "./testUtils.js";

// POST /api/providers/[id]/test - Test connection with optional model selection
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    // Body is optional: the one-by-one loop and the edit-connection modal POST
    // with no body at all (the pre-model-selection callers). An unguarded
    // request.json() threw on the empty body and every one-by-one test came
    // back as a 500 "Test failed".
    const body = await request.json().catch(() => ({}));
    const result = await testSingleConnection(id, { model: body.model || null });

    if (result.error === "Connection not found") {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    return NextResponse.json({
      valid: result.valid,
      error: result.error,
      refreshed: result.refreshed || false,
    });
  } catch (error) {
    if (error.code === "TESTING_NOT_ALLOWED") return NextResponse.json({ valid: false, error: error.message }, { status: 403 });
    console.log("Error testing connection:", error);
    if (error.code === "AG_TOS_QUARANTINED" || error.code === "AG_QUARANTINE_CHECK_FAILED") {
      return NextResponse.json({ valid: false, error: error.message, code: error.code }, {
        status: error.code === "AG_TOS_QUARANTINED" ? 403 : 503,
      });
    }
    return NextResponse.json({ error: "Test failed" }, { status: 500 });
  }
}
