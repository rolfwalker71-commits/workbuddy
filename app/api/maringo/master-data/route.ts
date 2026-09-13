import { NextResponse } from "next/server";
import { withMariModule } from "@/lib/mari/with-module";
import { MariApiError } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import {
  getMariMasterDataStatus,
  syncMariMasterData,
} from "@/lib/mari/sync-master-data-if-due";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stand des lokalen Vertrags-Caches. */
export async function GET() {
  return withMariModule(async () => {
    return NextResponse.json(getMariMasterDataStatus());
  });
}

/** Manuell auffrischen — für einen Vertrag, der gerade erst angelegt wurde. */
export async function POST() {
  return withMariModule(async () => {
    if (!hasMariConfig()) {
      return NextResponse.json(
        {
          error:
            "MARI nicht konfiguriert. Personalnummer unter Konto, REST-Zugang in der .env.",
        },
        { status: 400 }
      );
    }
    try {
      const result = await syncMariMasterData({ force: true });
      if (!result.attempted) {
        return NextResponse.json(
          { error: `Sync nicht möglich: ${result.reason ?? "unbekannt"}` },
          { status: 409 }
        );
      }
      return NextResponse.json({
        ok: true,
        message: `${result.contracts} Verträge, ${result.positions} Positionen in ${result.ms} ms.`,
        ...getMariMasterDataStatus(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = err instanceof MariApiError ? err.status || 502 : 502;
      return NextResponse.json({ error: message }, { status });
    }
  });
}
