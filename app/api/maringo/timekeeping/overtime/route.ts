import { NextResponse } from "next/server";
import { withMariModule } from "@/lib/mari/with-module";
import { MariApiError, requireMariConfig } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import { normalizeMariEmployeeNumber } from "@/lib/mari/tickets";
import { getMariOvertimeHoursForDay } from "@/lib/mari/timekeeping-overtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withMariModule(async () => {
    if (!hasMariConfig()) {
      return NextResponse.json(
        { error: "MARI nicht konfiguriert.", configured: false },
        { status: 503 }
      );
    }
    try {
      const date = new URL(request.url).searchParams.get("date");
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json(
          { error: "Parameter date=YYYY-MM-DD erforderlich." },
          { status: 400 }
        );
      }
      const emp = normalizeMariEmployeeNumber(
        requireMariConfig().employeeNumber
      );
      const overtimeHours = emp
        ? await getMariOvertimeHoursForDay({
            employeeNumber: emp,
            dateYmd: date,
          })
        : null;
      return NextResponse.json({
        configured: true,
        date,
        overtimeHours,
      });
    } catch (err) {
      const message =
        err instanceof MariApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      const status = err instanceof MariApiError ? err.status || 502 : 502;
      return NextResponse.json({ error: message }, { status });
    }
  });
}
