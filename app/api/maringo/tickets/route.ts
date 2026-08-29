import { NextResponse } from "next/server";
import { z } from "zod";
import { withMariModule } from "@/lib/mari/with-module";
import { zurichYmd } from "@/lib/microsoft/time";
import { MariApiError, requireMariConfig } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import { getMariUnconfiguredPublic } from "@/lib/mari/settings";
import { mapPrimaryMariCalendarStampsByIssueIds } from "@/lib/mari/calendar-stamp";
import { parseCardCodesParam } from "@/lib/mari/customers";
import { parseStatusIdsParam, WORK_STATUS_IDS } from "@/lib/mari/status";
import {
  createMariIssue,
  joinMariContactPerson,
} from "@/lib/mari/create-issue";
import {
  listMyTickets,
  normalizeMariEmployeeNumber,
  parseEmployeeNumbersParam,
  type MariTicketListItem,
} from "@/lib/mari/tickets";
import {
  TTV_INBOX_STATUS_ID,
  sanitizeTtvLookbackDays,
  ttvInboxDateWindow,
} from "@/lib/mari/ttv";
import { getMariTicketFilterPrefs } from "@/lib/mari/ticket-filter-prefs";
import { getAppUserById } from "@/lib/users/queries";
import { ownerKeyFromAuth } from "@/lib/auth/owner-key";
import { attachMariTicketAnalysisFlags } from "@/lib/mari/ticket-analysis-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function stampsForTickets(userId: number | null, tickets: MariTicketListItem[]) {
  if (userId == null) return {};
  return mapPrimaryMariCalendarStampsByIssueIds(
    userId,
    tickets.map((t) => t.issueId),
    zurichYmd()
  );
}

export async function GET(request: Request) {
  return withMariModule(async (auth) => {

  if (!hasMariConfig()) {
    return NextResponse.json(
      {
        ...getMariUnconfiguredPublic(),
        tickets: [],
        calendarStamps: {},
      },
      { status: 503 }
    );
  }

  try {
    const cfg = requireMariConfig();
    const url = new URL(request.url);
    const userEmp =
      auth.userId != null
        ? getAppUserById(auth.userId)?.mari_employee_number
        : null;
    const defaultHandledBy =
      normalizeMariEmployeeNumber(userEmp) ||
      cfg.employeeNumber.trim().toUpperCase();

    if (url.searchParams.get("filterMode") === "ttv") {
      const ownerKey = ownerKeyFromAuth(auth);
      const lookbackDays =
        sanitizeTtvLookbackDays(url.searchParams.get("ttvDays")) ??
        getMariTicketFilterPrefs(ownerKey).ttvLookbackDays;
      const window = ttvInboxDateWindow(undefined, lookbackDays);
      const tickets = attachMariTicketAnalysisFlags(
        ownerKey,
        await listMyTickets({
          ttvInbox: true,
          requestDateFrom: window.fromYmd,
        })
      );
      return NextResponse.json({
        configured: true,
        tickets,
        calendarStamps: stampsForTickets(auth.userId, tickets),
        statuses: [TTV_INBOX_STATUS_ID],
        overdueOnly: false,
        filterMode: "ttv" as const,
        ttvLookbackDays: window.lookbackDays,
        requestDateFrom: window.fromYmd,
        requestDateTo: window.toYmd,
        defaultHandledBy,
      });
    }

    const statuses = parseStatusIdsParam(
      url.searchParams.get("status"),
      WORK_STATUS_IDS
    );
    const overdueOnly = url.searchParams.get("overdue") === "1";
    const cardCodes = parseCardCodesParam(url.searchParams.get("cardCodes"));

    if (cardCodes.length > 0) {
      const tickets = attachMariTicketAnalysisFlags(
        ownerKeyFromAuth(auth),
        await listMyTickets({
          statuses,
          overdueOnly,
          cardCodes,
        })
      );
      return NextResponse.json({
        configured: true,
        tickets,
        calendarStamps: stampsForTickets(auth.userId, tickets),
        statuses,
        overdueOnly,
        cardCodes,
        filterMode: "customer" as const,
        defaultHandledBy,
      });
    }

    const handledByParam =
      url.searchParams.get("handledBy") ||
      url.searchParams.get("employee") ||
      null;
    const handledByList = parseEmployeeNumbersParam(handledByParam);
    const handledBy =
      handledByList[0] ||
      normalizeMariEmployeeNumber(userEmp) ||
      normalizeMariEmployeeNumber(cfg.employeeNumber);
    const employeeNumbers =
      handledByList.length > 0
        ? handledByList
        : handledBy
          ? [handledBy]
          : [];
    if (employeeNumbers.length === 0) {
      return NextResponse.json(
        {
          error: "Personalnummer ungültig (z.B. M1010).",
          tickets: [],
          calendarStamps: {},
        },
        { status: 400 }
      );
    }
    const tickets = attachMariTicketAnalysisFlags(
      ownerKeyFromAuth(auth),
      await listMyTickets({
        statuses,
        overdueOnly,
        employeeNumbers,
      })
    );
    return NextResponse.json({
      configured: true,
      tickets,
        calendarStamps: stampsForTickets(auth.userId, tickets),
        statuses,
        overdueOnly,
        handledBy: employeeNumbers.join(","),
        handledByList: employeeNumbers,
      filterMode: "handler" as const,
      defaultHandledBy,
    });
  } catch (err) {
    const message =
      err instanceof MariApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    const status = err instanceof MariApiError ? err.status || 502 : 502;
    return NextResponse.json(
      { error: message, tickets: [], calendarStamps: {} },
      { status }
    );
  }
  });
}

const CreateIssueSchema = z.object({
  briefDescription: z.string().trim().min(1).max(250),
  requestText: z.string().trim().max(8000).optional().default(""),
  contactPerson: z.string().trim().max(250).nullable().optional(),
  contactName: z.string().trim().max(200).nullable().optional(),
  contactEmail: z.string().trim().max(120).nullable().optional(),
  cardCode: z.string().trim().max(50).nullable().optional(),
  projectNumber: z.string().trim().min(1).max(40),
  contractId: z.number().int().nonnegative().nullable().optional(),
  contractPositionId: z.number().int().nonnegative().nullable().optional(),
  handledBy: z.string().trim().max(20).nullable().optional(),
  supportGroupId: z.number().int().nonnegative().nullable().optional(),
  priority: z.number().int().positive().nullable().optional(),
  medium: z.number().int().nonnegative().nullable().optional(),
});

export async function POST(request: Request) {
  return withMariModule(async () => {
    if (!hasMariConfig()) {
      return NextResponse.json(
        { error: "MARI nicht konfiguriert." },
        { status: 503 }
      );
    }

    const json = await request.json().catch(() => null);
    const parsed = CreateIssueSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Ungültige Eingabe",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const contactPerson =
      parsed.data.contactPerson?.trim() ||
      joinMariContactPerson(
        parsed.data.contactName,
        parsed.data.contactEmail
      );

    try {
      const { ticket, payload } = await createMariIssue({
        briefDescription: parsed.data.briefDescription,
        requestText: parsed.data.requestText,
        contactPerson,
        cardCode: parsed.data.cardCode,
        projectNumber: parsed.data.projectNumber,
        contractId: parsed.data.contractId,
        contractPositionId: parsed.data.contractPositionId,
        handledBy: parsed.data.handledBy,
        supportGroupId: parsed.data.supportGroupId,
        priority: parsed.data.priority,
        medium: parsed.data.medium,
      });
      return NextResponse.json({ ok: true, ticket, payload });
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
