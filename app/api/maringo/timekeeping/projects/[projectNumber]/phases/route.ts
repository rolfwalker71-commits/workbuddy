import { NextResponse } from "next/server";
import { withMariModule } from "@/lib/mari/with-module";
import { MariApiError } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import { listPhasesForTimeBooking } from "@/lib/mari/timekeeping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectNumber: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  return withMariModule(async () => {
  if (!hasMariConfig()) {
    return NextResponse.json(
      { error: "MARI nicht konfiguriert.", phases: [] },
      { status: 503 }
    );
  }
  try {
    const { projectNumber } = await ctx.params;
    const companyRaw = Number(new URL(_request.url).searchParams.get("company"));
    const company =
      Number.isInteger(companyRaw) && companyRaw > 0 ? companyRaw : null;
    const phases = await listPhasesForTimeBooking(
      decodeURIComponent(projectNumber),
      company
    );
    return NextResponse.json({ phases });
  } catch (err) {
    const message =
      err instanceof MariApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    const status = err instanceof MariApiError ? err.status || 502 : 502;
    return NextResponse.json({ error: message, phases: [] }, { status });
  }
  });
}
