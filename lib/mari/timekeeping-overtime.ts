import { mariSql } from "@/lib/mari/client";
import { normalizeMariEmployeeNumber } from "@/lib/mari/tickets";
import { addDaysYmd } from "@/lib/mari/timekeeping-shared";
import {
  mariPeriodFromYmd,
  mariPeriodStartYmd,
  runningOvertimeHours,
} from "@/lib/mari/timekeeping-overtime-shared";

/**
 * Same per-day Überstunden as Maringo's Tag grid (planned vs project hours).
 * Returns null when calendar/period data is missing — never invent a number.
 */
export async function getMariOvertimeHoursForDay(input: {
  employeeNumber: string;
  dateYmd: string;
}): Promise<number | null> {
  const emp = normalizeMariEmployeeNumber(input.employeeNumber);
  if (!emp) return null;
  const ymd = input.dateYmd;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;

  const period = mariPeriodFromYmd(ymd);
  const empQ = emp.replace(/'/g, "''");
  const periodRows = await mariSql<{
    InitialValue?: unknown;
    CalendarID?: unknown;
    ValidFrom?: unknown;
  }>(
    `SELECT TOP 1 "InitialValue", "CalendarID", "ValidFrom"
FROM "vwMARIEmployeePeriod"
WHERE "EmployeeNumber" = '${empQ}'
  AND "Period" = ${period}`
  );
  const prow = periodRows[0];
  const calendarId = Number(prow?.CalendarID);
  const validFrom = Number(prow?.ValidFrom);
  if (!Number.isInteger(calendarId) || calendarId <= 0) return null;
  if (!Number.isInteger(validFrom) || validFrom < 1900001) return null;

  const fromDate = mariPeriodStartYmd(validFrom);
  const toExclusive = addDaysYmd(ymd, 1);
  const startRaw = Number(prow?.InitialValue);
  const startValue = Number.isFinite(startRaw) ? startRaw : 0;

  const [calRows, hourRows] = await Promise.all([
    mariSql<{ CalendarDate: unknown; WorkHours: unknown }>(
      `SELECT "CalendarDate", "WorkHours"
FROM "MARICalendarDays"
WHERE "CalendarID" = ${calendarId}
  AND "CalendarDate" >= '${fromDate}'
  AND "CalendarDate" < '${toExclusive}'
ORDER BY "CalendarDate"`
    ),
    mariSql<{ ServiceDate: unknown; Hours: unknown }>(
      `SELECT "ServiceDate", SUM("Quantity") AS "Hours"
FROM "MARIProjectTimeKeepingLines"
WHERE "EmployeeNumber" = '${empQ}'
  AND "ServiceDate" >= '${fromDate}'
  AND "ServiceDate" < '${toExclusive}'
GROUP BY "ServiceDate"`
    ),
  ]);

  if (calRows.length === 0) return null;

  const booked = new Map<string, number>();
  for (const r of hourRows) {
    const d = String(r.ServiceDate || "").slice(0, 10);
    if (!d) continue;
    booked.set(d, Number(r.Hours) || 0);
  }

  const days = calRows.map((r) => {
    const d = String(r.CalendarDate || "").slice(0, 10);
    return {
      targetHours: Number(r.WorkHours) || 0,
      bookedHours: booked.get(d) || 0,
    };
  });

  return runningOvertimeHours(startValue, days);
}
