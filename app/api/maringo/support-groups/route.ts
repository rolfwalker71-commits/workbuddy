import { NextResponse } from "next/server";
import { withMariModule } from "@/lib/mari/with-module";
import { MariApiError } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import { listMariSupportGroups } from "@/lib/mari/ticket-meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withMariModule(async () => {

  if (!hasMariConfig()) {
    return NextResponse.json(
      { error: "MARI nicht konfiguriert.", configured: false, groups: [] },
      { status: 503 }
    );
  }

  try {
    const groups = await listMariSupportGroups();
    return NextResponse.json({ configured: true, groups });
  } catch (err) {
    const message =
      err instanceof MariApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    const status = err instanceof MariApiError ? err.status || 502 : 502;
    return NextResponse.json({ error: message, groups: [] }, { status });
  }
  });
}
