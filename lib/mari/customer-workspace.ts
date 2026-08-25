import { addDaysYmd, zurichYmd } from "@/lib/microsoft/time";
import {
  getMariCustomerByCardCode,
  normalizeMariCardCode,
} from "@/lib/mari/customers";
import { listMyTickets, type MariTicketListItem } from "@/lib/mari/tickets";
import { listTimeLinesForTicket } from "@/lib/mari/timekeeping";
import { mapPrimaryMariCalendarStampsByIssueIds } from "@/lib/mari/calendar-stamp";
import { CLOSED_STATUS_IDS } from "@/lib/mari/status";
import type { MariCalendarStamp } from "@/lib/mari/calendar-stamp";
import type { MariTimeLine } from "@/lib/mari/timekeeping-shared";

export type CustomerWorkspaceHoursLine = {
  issueId: number;
  serviceDate: string;
  hours: number;
  activity: string;
};

export type CustomerWorkspacePayload = {
  cardCode: string;
  name: string;
  tickets: MariTicketListItem[];
  openCount: number;
  hoursTotal: number;
  hoursThisWeek: number;
  lastLines: CustomerWorkspaceHoursLine[];
  upcomingStamps: MariCalendarStamp[];
};

function mondayOfWeek(ymd: string): string {
  const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  return addDaysYmd(ymd, offset);
}

function isOpenTicket(status: number): boolean {
  return !CLOSED_STATUS_IDS.has(status);
}

export async function loadCustomerWorkspace(
  userId: number | null,
  cardCodeRaw: string
): Promise<CustomerWorkspacePayload> {
  const cardCode = normalizeMariCardCode(cardCodeRaw);
  if (!cardCode) {
    throw new Error("CardCode ungültig.");
  }
  const today = zurichYmd();
  const weekStart = mondayOfWeek(today);
  const [customer, tickets] = await Promise.all([
    getMariCustomerByCardCode(cardCode),
    listMyTickets({ cardCodes: [cardCode], limit: 80 }),
  ]);
  const name =
    customer?.name ||
    tickets.find((t) => t.addressMatchcode)?.addressMatchcode ||
    cardCode;

  const hourTickets = tickets.slice(0, 15);
  const lineGroups = await Promise.all(
    hourTickets.map((t) =>
      listTimeLinesForTicket(t.issueId).catch(() => [] as MariTimeLine[])
    )
  );
  let hoursTotal = 0;
  let hoursThisWeek = 0;
  const lastLines: CustomerWorkspaceHoursLine[] = [];
  hourTickets.forEach((ticket, i) => {
    for (const line of lineGroups[i] || []) {
      hoursTotal += line.hours;
      if (line.serviceDate >= weekStart) hoursThisWeek += line.hours;
      lastLines.push({
        issueId: ticket.issueId,
        serviceDate: line.serviceDate,
        hours: line.hours,
        activity: line.activity,
      });
    }
  });
  lastLines.sort((a, b) => b.serviceDate.localeCompare(a.serviceDate));

  const stamps =
    userId != null
      ? mapPrimaryMariCalendarStampsByIssueIds(
          userId,
          tickets.map((t) => t.issueId),
          today
        )
      : {};
  const upcomingStamps = Object.values(stamps)
    .filter((s) => s.eventDate >= today)
    .sort((a, b) => {
      const d = a.eventDate.localeCompare(b.eventDate);
      if (d !== 0) return d;
      return (a.startHm || "").localeCompare(b.startHm || "");
    })
    .slice(0, 8);

  return {
    cardCode,
    name,
    tickets,
    openCount: tickets.filter((t) => isOpenTicket(t.status)).length,
    hoursTotal: Math.round(hoursTotal * 100) / 100,
    hoursThisWeek: Math.round(hoursThisWeek * 100) / 100,
    lastLines: lastLines.slice(0, 8),
    upcomingStamps,
  };
}
