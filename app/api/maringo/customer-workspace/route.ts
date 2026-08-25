import { NextResponse } from "next/server";
import { withMariModule } from "@/lib/mari/with-module";
import { MariApiError } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import { loadCustomerWorkspace } from "@/lib/mari/customer-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function GET(request: Request) {
  return withMariModule(async (auth) => {
    if (!hasMariConfig()) {
      return NextResponse.json(
        { error: "MARI nicht konfiguriert.", configured: false },
        { status: 503 }
      );
    }
    const cardCode = new URL(request.url).searchParams.get("cardCode") || "";
    try {
      const workspace = await loadCustomerWorkspace(auth.userId, cardCode);
      return NextResponse.json({ configured: true, ...workspace });
    } catch (err) {
      const message =
        err instanceof MariApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      const status = err instanceof MariApiError ? err.status || 502 : 400;
      return NextResponse.json({ error: message }, { status });
    }
  });
}
