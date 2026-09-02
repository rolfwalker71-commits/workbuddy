import { NextResponse } from "next/server";
import { withMariModule } from "@/lib/mari/with-module";
import { MariApiError } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import {
  EnrichTimeLineLabelsSchema,
  enrichTimeLineContractLabels,
} from "@/lib/mari/timekeeping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withMariModule(async () => {
    if (!hasMariConfig()) {
      return NextResponse.json(
        { error: "MARI nicht konfiguriert.", lines: [] },
        { status: 503 }
      );
    }
    try {
      const json = await request.json().catch(() => null);
      const parsed = EnrichTimeLineLabelsSchema.safeParse(json);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Ungültige Eingabe." },
          { status: 400 }
        );
      }
      const lines = await enrichTimeLineContractLabels(parsed.data.lines);
      return NextResponse.json({
        ok: true,
        lines: lines.map((l) => ({
          lineId: l.lineId,
          projectCustomer: l.projectCustomer,
          contractId: l.contractId,
          contractNumber: l.contractNumber,
          contractName: l.contractName,
          contractPositionId: l.contractPositionId,
          contractPositionNumber: l.contractPositionNumber,
          contractPositionName: l.contractPositionName,
        })),
      });
    } catch (err) {
      const message =
        err instanceof MariApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      const status = err instanceof MariApiError ? err.status || 502 : 502;
      return NextResponse.json({ error: message, lines: [] }, { status });
    }
  });
}
