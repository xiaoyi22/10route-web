import { NextResponse } from "next/server";
import { getAvailability, updateAvailabilityConfig, changeAvailability } from "@/lib/availability/service.js";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json(await getAvailability(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { console.error("[modelAvailability] read failed", error.message); return NextResponse.json({ error: "可用性数据读取失败" }, { status: 503 }); }
}
export async function PUT(request) {
  try { return NextResponse.json(await updateAvailabilityConfig(await request.json())); }
  catch (error) { return NextResponse.json({ error: error.message }, { status: error.status || 400 }); }
}
export async function POST(request) {
  try { return NextResponse.json(await changeAvailability(await request.json())); }
  catch (error) { return NextResponse.json({ error: error.message }, { status: error.status || 400 }); }
}
