import { NextResponse } from "next/server";
import { z } from "zod";
import { withMariModule } from "@/lib/mari/with-module";
import { zurichYmd } from "@/lib/microsoft/time";
import { sanitizeYmd } from "@/lib/mari/ttv";
import {
  clearTtvDuty,
  getTtvDutyForDay,
  isClaimableYmd,
  listTtvDuty,
  setTtvDuty,
  weekRangeFrom,
} from "@/lib/mari/ttv-duty";
import { listActiveUsersWithModule } from "@/lib/users/queries";
import { normalizeMariEmployeeNumber } from "@/lib/mari/tickets";
import {
  listMariSupportGroupMemberships,
  listMariSupportGroups,
} from "@/lib/mari/ticket-meta";
import {
  firstSupportGroupIdForEmployee,
  supportGroupIdsByEmployee,
} from "@/lib/mari/support-group-staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutSchema = z.object({
  ymd: z.string().min(8).max(10),
  userId: z.number().int().positive().nullable().optional(),
  claim: z.boolean().optional(),
});

function dutyUserBase() {
  return listActiveUsersWithModule("maringo").map((u) => ({
    id: u.id,
    displayName: u.display_name?.trim() || u.username,
    employeeNumber: normalizeMariEmployeeNumber(u.mari_employee_number),
  }));
}

async function dutyStaff(authUserId: number | null | undefined) {
  const base = dutyUserBase();
  let groups: Awaited<ReturnType<typeof listMariSupportGroups>> = [];
  let memberships: Awaited<
    ReturnType<typeof listMariSupportGroupMemberships>
  > = [];
  try {
    [groups, memberships] = await Promise.all([
      listMariSupportGroups(),
      listMariSupportGroupMemberships(),
    ]);
  } catch {
    /* TTV bleibt nutzbar — ohne Gruppenfilter */
  }
  const byEmp = supportGroupIdsByEmployee(memberships);
  const users = base.map((u) => ({
    ...u,
    supportGroupIds: u.employeeNumber
      ? byEmp.get(u.employeeNumber) ?? []
      : [],
  }));
  const me = users.find((u) => u.id === authUserId);
  return {
    groups,
    users,
    defaultSupportGroupId: firstSupportGroupIdForEmployee(
      users.map((u) => ({
        employeeNumber: u.employeeNumber || "",
        supportGroupIds: u.supportGroupIds,
      })),
      me?.employeeNumber
    ),
  };
}

export async function GET(request: Request) {
  return withMariModule(async (auth) => {
    const url = new URL(request.url);
    const today = zurichYmd();
    const week = weekRangeFrom(url.searchParams.get("week") || today);
    const from = sanitizeYmd(url.searchParams.get("from")) || week.fromYmd;
    const to = sanitizeYmd(url.searchParams.get("to")) || week.toYmd;
    const todayDuty = getTtvDutyForDay(today);
    const staff = await dutyStaff(auth.userId);
    return NextResponse.json({
      today,
      todayDuty,
      isMe: todayDuty?.userId === auth.userId,
      isAdmin: auth.isAdmin,
      days: listTtvDuty(from, to),
      from,
      to,
      users: staff.users,
      groups: staff.groups,
      defaultSupportGroupId: staff.defaultSupportGroupId,
      ttvInboxHref: "/maringo?filter=ttv",
    });
  });
}

export async function PUT(request: Request) {
  return withMariModule(async (auth) => {
    const parsed = PutSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }
    const ymd = sanitizeYmd(parsed.data.ymd);
    if (!ymd) {
      return NextResponse.json({ error: "Datum ungültig." }, { status: 400 });
    }
    const today = zurichYmd();

    if (parsed.data.claim) {
      if (auth.userId == null) {
        return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
      }
      if (!auth.isAdmin && !isClaimableYmd(ymd, today)) {
        return NextResponse.json(
          { error: "Übernehmen geht nur für heute oder morgen." },
          { status: 403 }
        );
      }
      const entry = setTtvDuty({
        ymd,
        userId: auth.userId,
        source: "claim",
      });
      return NextResponse.json({ today, todayDuty: getTtvDutyForDay(today), entry });
    }

    if (parsed.data.userId == null) {
      clearTtvDuty(ymd);
      return NextResponse.json({
        today,
        todayDuty: getTtvDutyForDay(today),
        entry: null,
      });
    }
    const allowed = dutyUserBase().some((u) => u.id === parsed.data.userId);
    if (!allowed) {
      return NextResponse.json(
        { error: "Nur User mit Maringo Support können den Dienst haben." },
        { status: 400 }
      );
    }
    const entry = setTtvDuty({
      ymd,
      userId: parsed.data.userId,
      source: "admin",
    });
    return NextResponse.json({ today, todayDuty: getTtvDutyForDay(today), entry });
  });
}

export async function POST(request: Request) {
  return PUT(request);
}
