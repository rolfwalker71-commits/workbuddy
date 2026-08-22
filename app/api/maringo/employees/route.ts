import { NextResponse } from "next/server";
import { withMariModule } from "@/lib/mari/with-module";
import { MariApiError, requireMariConfig } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import { listMariEmployees } from "@/lib/mari/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withMariModule(async () => {

  if (!hasMariConfig()) {
    return NextResponse.json(
      {
        error: "MARI nicht konfiguriert.",
        configured: false,
        employees: [],
      },
      { status: 503 }
    );
  }

  try {
    const cfg = requireMariConfig();
    const employees = await listMariEmployees();
    return NextResponse.json({
      configured: true,
      defaultEmployeeNumber: cfg.employeeNumber.trim().toUpperCase(),
      employees,
    });
  } catch (err) {
    const message =
      err instanceof MariApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    const status = err instanceof MariApiError ? err.status || 502 : 502;
    return NextResponse.json({ error: message, employees: [] }, { status });
  }
  });
}
