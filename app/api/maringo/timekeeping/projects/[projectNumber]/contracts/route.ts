import { NextResponse } from "next/server";
import { withMariModule } from "@/lib/mari/with-module";
import { MariApiError } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import { listContractsForProject } from "@/lib/mari/timekeeping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectNumber: string }> };

export async function GET(request: Request, ctx: Ctx) {
  return withMariModule(async () => {
  if (!hasMariConfig()) {
    return NextResponse.json(
      { error: "MARI nicht konfiguriert.", contracts: [] },
      { status: 503 }
    );
  }
  try {
    const { projectNumber } = await ctx.params;
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get("activeOnly") !== "0";
    const companyRaw = Number(url.searchParams.get("company"));
    const company =
      Number.isInteger(companyRaw) && companyRaw > 0 ? companyRaw : null;
    const contracts = await listContractsForProject(
      decodeURIComponent(projectNumber),
      activeOnly,
      company
    );
    return NextResponse.json({ contracts });
  } catch (err) {
    const message =
      err instanceof MariApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    const status = err instanceof MariApiError ? err.status || 502 : 502;
    return NextResponse.json({ error: message, contracts: [] }, { status });
  }
  });
}
