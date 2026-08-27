import { NextResponse } from "next/server";
import { z } from "zod";
import { withMariModule } from "@/lib/mari/with-module";
import { ownerKeyFromAuth } from "@/lib/auth/owner-key";
import { hasMariConfig } from "@/lib/mari/config";
import { countMyTickets, MARI_EMPLOYEE_FILTER_MAX } from "@/lib/mari/tickets";
import {
  createMariTicketSavedView,
  listMariTicketSavedViews,
  mariTicketSavedViewHref,
  type MariTicketSavedView,
} from "@/lib/mari/ticket-saved-views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PostSchema = z.object({
  label: z.string().min(1).max(60),
  handledBy: z.array(z.string()).min(1).max(MARI_EMPLOYEE_FILTER_MAX),
  statuses: z.array(z.number().int().positive()).optional(),
  overdueOnly: z.boolean().optional(),
  showOnHome: z.boolean().optional(),
});

async function withCounts(views: MariTicketSavedView[]) {
  if (!hasMariConfig()) {
    return views.map((view) => ({
      ...view,
      count: null as number | null,
      href: mariTicketSavedViewHref(view),
    }));
  }
  const counted = await Promise.all(
    views.map(async (view) => {
      try {
        const count = await countMyTickets({
          employeeNumbers: view.handledBy,
          statuses: view.statuses,
          overdueOnly: view.overdueOnly,
        });
        return {
          ...view,
          count,
          href: mariTicketSavedViewHref(view),
        };
      } catch (err) {
        console.warn(
          "[ticket-views] count failed:",
          err instanceof Error ? err.message : err
        );
        return {
          ...view,
          count: null as number | null,
          href: mariTicketSavedViewHref(view),
        };
      }
    })
  );
  return counted;
}

export async function GET() {
  return withMariModule(async (auth) => {
    const views = listMariTicketSavedViews(ownerKeyFromAuth(auth));
    return NextResponse.json({ views: await withCounts(views) });
  });
}

export async function POST(request: Request) {
  return withMariModule(async (auth) => {
    const parsed = PostSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      const tooManyHandlers = parsed.error.issues.some(
        (issue) => issue.path[0] === "handledBy" && issue.code === "too_big"
      );
      return NextResponse.json(
        {
          error: tooManyHandlers
            ? `Höchstens ${MARI_EMPLOYEE_FILTER_MAX} Bearbeiter in einer Sicht.`
            : "Ungültige Eingabe",
        },
        { status: 400 }
      );
    }
    try {
      const view = createMariTicketSavedView(ownerKeyFromAuth(auth), parsed.data);
      const [withCount] = await withCounts([view]);
      return NextResponse.json({ view: withCount });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 400 }
      );
    }
  });
}
