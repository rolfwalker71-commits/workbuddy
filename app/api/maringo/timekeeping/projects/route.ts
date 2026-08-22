import { NextResponse } from "next/server";
import { withMariModule } from "@/lib/mari/with-module";
import { MariApiError } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import { listProjectsForTimeBooking } from "@/lib/mari/timekeeping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withMariModule(async () => {
  if (!hasMariConfig()) {
    return NextResponse.json(
      { error: "MARI nicht konfiguriert.", configured: false, projects: [] },
      { status: 503 }
    );
  }
  try {
    const q = new URL(request.url).searchParams.get("q");
    const projects = await listProjectsForTimeBooking({ q });
    return NextResponse.json({ configured: true, projects });
  } catch (err) {
    const message =
      err instanceof MariApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    const status = err instanceof MariApiError ? err.status || 502 : 502;
    return NextResponse.json({ error: message, projects: [] }, { status });
  }
  });
}
