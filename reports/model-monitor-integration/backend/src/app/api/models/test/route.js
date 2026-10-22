import { NextResponse } from "next/server";
import { getSettings } from "@/lib/localDb";
import { assertTestingAllowed } from "@/lib/iqMonitor/testingPolicy";
import { pingModelByKind, pingIqModel } from "./ping";

// POST /api/models/test - Ping a single model via internal completions or embeddings
//
// `probe: "iq"` swaps the liveness ping for the IQ puzzle configured in
// settings (question + expected answer), graded server-side. Still one model
// per request and one upstream round-trip: some providers ban accounts that
// get probed in bulk or on a schedule, so batching stays the caller's problem.
export async function POST(request) {
  try {
    const { model, kind, probe, monitorTarget, thinkingLevel } = await request.json();
    if (!model) return NextResponse.json({ error: "Model required" }, { status: 400 });

    if (monitorTarget) {
      const { getModelInfo } = await import("@/sse/services/model");
      const { runManualMonitorTest } = await import("@/lib/iqMonitor/service");
      const info = await getModelInfo(model, { inferFallback: false });
      if (info?.provider !== monitorTarget.provider || info?.model !== monitorTarget.model) return NextResponse.json({ error: "Monitor target does not match model route" }, { status: 400 });
      try { return NextResponse.json(await runManualMonitorTest(monitorTarget, probe === "iq" ? "iq" : "availability", thinkingLevel)); }
      catch (error) { return NextResponse.json({ ok: false, error: error.message }, { status: error.status || 400 }); }
    }

    const { getModelInfo: resolveTestModel } = await import("@/sse/services/model");
    const testInfo = await resolveTestModel(model, { inferFallback: false });
    if (!testInfo?.provider) return NextResponse.json({ error: "Unknown model route" }, { status: 400 });
    await assertTestingAllowed(testInfo.provider, "manual");
    if (probe === "iq") {
      const settings = await getSettings();
      const iq = settings.iqProbe || {};
      const result = await pingIqModel(model, iq.question, iq.answer);
      return NextResponse.json(result);
    }

    // Dashboard text-model tests exercise the configured upstream, independently
    // of the downstream publication allowlist and downstream API-key scopes.
    if (!kind || kind === "llm") {
      const { getModelInfo } = await import("@/sse/services/model");
      const { probeTarget } = await import("@/lib/iqMonitor/probe");
      const info = await getModelInfo(model, { inferFallback: false });
      if (!info?.provider || !info?.model) return NextResponse.json({ ok: false, error: "Unknown model route" }, { status: 400 });
      const result = await probeTarget({ provider: info.provider, model: info.model, maxOutputTokens: 1024, testTrigger: "manual" }, null, "availability");
      return NextResponse.json(result);
    }

    const result = await pingModelByKind(model, kind);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status || 500 });
  }
}
