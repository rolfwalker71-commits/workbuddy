import { NextResponse } from "next/server";
import { z } from "zod";
import { withMariModule } from "@/lib/mari/with-module";
import { ownerKeyFromAuth } from "@/lib/auth/owner-key";
import {
  getMariTicketFilterPrefs,
  saveMariTicketFilterPrefs,
} from "@/lib/mari/ticket-filter-prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutSchema = z.object({
  statuses: z.array(z.number().int().positive()).optional(),
  overdueOnly: z.boolean().optional(),
  filterMode: z.enum(["handler", "customer", "ttv"]).optional(),
  customers: z
    .array(
      z.object({
        cardCode: z.string().min(1).max(50),
        name: z.string().max(120).optional(),
      })
    )
    .max(40)
    .optional(),
  timelineSort: z.enum(["newest", "oldest"]).optional(),
  listSort: z.enum(["newest", "oldest"]).optional(),
  listMetaFields: z
    .array(
      z.enum([
        "kunde",
        "projekt",
        "vertrag",
        "aktivitaet",
        "seit",
        "geaendert",
      ])
    )
    .optional(),
});

export async function GET() {
  return withMariModule(async (auth) => {
  const prefs = getMariTicketFilterPrefs(ownerKeyFromAuth(auth));
  return NextResponse.json(prefs);
  });
}

export async function PUT(request: Request) {
  return withMariModule(async (auth) => {
  const parsed = PutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }
  const prefs = saveMariTicketFilterPrefs(ownerKeyFromAuth(auth), parsed.data);
  return NextResponse.json(prefs);
  });
}
