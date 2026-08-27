import { NextResponse } from "next/server";
import { z } from "zod";
import { withMariModule } from "@/lib/mari/with-module";
import { ownerKeyFromAuth } from "@/lib/auth/owner-key";
import { MARI_EMPLOYEE_FILTER_MAX } from "@/lib/mari/tickets";
import {
  deleteMariTicketSavedView,
  updateMariTicketSavedView,
  mariTicketSavedViewHref,
} from "@/lib/mari/ticket-saved-views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  label: z.string().min(1).max(60).optional(),
  handledBy: z.array(z.string()).min(1).max(MARI_EMPLOYEE_FILTER_MAX).optional(),
  statuses: z.array(z.number().int().positive()).optional(),
  overdueOnly: z.boolean().optional(),
  showOnHome: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return withMariModule(async (auth) => {
    const { id } = await context.params;
    const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }
    try {
      const view = updateMariTicketSavedView(
        ownerKeyFromAuth(auth),
        id,
        parsed.data
      );
      if (!view) {
        return NextResponse.json({ error: "Sicht nicht gefunden." }, { status: 404 });
      }
      return NextResponse.json({
        view: { ...view, href: mariTicketSavedViewHref(view) },
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 400 }
      );
    }
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return withMariModule(async (auth) => {
    const { id } = await context.params;
    const ok = deleteMariTicketSavedView(ownerKeyFromAuth(auth), id);
    if (!ok) {
      return NextResponse.json({ error: "Sicht nicht gefunden." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  });
}
