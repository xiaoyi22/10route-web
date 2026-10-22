import { NextResponse } from "next/server";
import { getMonitor, saveConfig } from "@/lib/iqMonitor/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try { return NextResponse.json(await getMonitor(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return NextResponse.json({ error: error.message }, { status: 500 }); }
}

export async function PUT(request) {
  try { return NextResponse.json({ config: await saveConfig(await request.json()) }); }
  catch (error) { return NextResponse.json({ error: error.message }, { status: error.status || 400 }); }
}
