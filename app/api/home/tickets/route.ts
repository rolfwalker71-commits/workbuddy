import { NextResponse } from "next/server";
import {
  isAuthError,
  requireAuth,
  runWithRequestSecrets,
} from "@/lib/auth/current-user";
import { ownerKeyFromAuth } from "@/lib/auth/owner-key";
import { resolveAppUserId } from "@/lib/users/resolve-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { getMariTicketsWatchStateLive } from "@/lib/mari/sync-tickets-if-due";
import { hasMariConfig } from "@/lib/mari/config";
import { countMyTickets, listMyTickets } from "@/lib/mari/tickets";
import { getMariTicketFilterPrefs } from "@/lib/mari/ticket-filter-prefs";
import {
  listMariTicketSavedViews,
  mariTicketSavedViewHref,
} from "@/lib/mari/ticket-saved-views";
import type { HomeTicketSavedViewKpi } from "@/lib/dashboard/home-overview-shared";
import { ttvInboxDateWindow } from "@/lib/mari/ttv";
import { zurichYmd } from "@/lib/microsoft/time";
import type { HomeTicketRow } from "@/lib/dashboard/home-surfaces-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

function isOverdue(dueDate: string | null, today: string): boolean {
  return Boolean(dueDate && dueDate < today);
}

export async function GET() {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  if (!auth.modules.includes("maringo")) {
    return NextResponse.json({
      tickets: null,
      ticketRows: [],
      ttvInboxCount: 0,
      savedViews: [],
    });
  }
  return runWithRequestSecrets(auth, async () => {
    const userId = resolveAppUserId(auth);
    const ownerKey = userId != null ? `user:${userId}` : ownerKeyFromAuth(auth);
    const today = zurichYmd();
    const tickets = await getMariTicketsWatchStateLive(ownerKey);
    let ticketRows: HomeTicketRow[] = [];
    let ttvInboxCount = 0;
    let savedViews: HomeTicketSavedViewKpi[] = listMariTicketSavedViews(
      ownerKey
    )
      .filter((v) => v.showOnHome)
      .map((v) => ({
        id: v.id,
        label: v.label,
        count: null,
        href: mariTicketSavedViewHref(v),
      }));
    if (hasMariConfig()) {
      try {
        const [mine, ttv] = await Promise.all([
          listMyTickets({ limit: 80 }),
          listMyTickets({
            ttvInbox: true,
            requestDateFrom: ttvInboxDateWindow(
              undefined,
              getMariTicketFilterPrefs(ownerKey).ttvLookbackDays
            ).fromYmd,
          }),
        ]);
        ticketRows = mine
          .filter((t) => isOverdue(t.dueDate, today) || t.dueDate === today)
          .slice(0, 20)
          .map((t) => ({
            issueId: t.issueId,
            briefDescription: t.briefDescription,
            dueDate: t.dueDate,
            status: t.status,
            statusName: t.statusName,
            cardCode: t.cardCode,
            addressMatchcode: t.addressMatchcode,
            overdue: isOverdue(t.dueDate, today),
          }));
        ttvInboxCount = ttv.length;
        const homeViews = listMariTicketSavedViews(ownerKey).filter(
          (v) => v.showOnHome
        );
        savedViews = await Promise.all(
          homeViews.map(async (view) => {
            try {
              const count = await countMyTickets({
                employeeNumbers: view.handledBy,
                statuses: view.statuses,
                overdueOnly: view.overdueOnly,
              });
              return {
                id: view.id,
                label: view.label,
                count,
                href: mariTicketSavedViewHref(view),
              };
            } catch {
              return {
                id: view.id,
                label: view.label,
                count: null,
                href: mariTicketSavedViewHref(view),
              };
            }
          })
        );
      } catch (err) {
        console.warn(
          "[home] ticket rows:",
          err instanceof Error ? err.message : err
        );
      }
    }
    return NextResponse.json({ tickets, ticketRows, ttvInboxCount, savedViews });
  });
}
