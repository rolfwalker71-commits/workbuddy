import { NextResponse } from "next/server";
import { z } from "zod";
import { withMariModule } from "@/lib/mari/with-module";
import { hasMariConfig } from "@/lib/mari/config";
import { recognizeEventBooking } from "@/lib/mari/event-booking";
import { classifyEventMeetingKind } from "@/lib/mari/event-booking-ref";
import {
  listContractPositionsForTimeKeeping,
  listContractsForProject,
} from "@/lib/mari/timekeeping";
import {
  findMariKeyPair,
  type MariKeyPair,
} from "@/lib/mari/timekeeping-shared";
import { mapWithConcurrency } from "@/lib/utils/map-concurrency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Everything the batch dialog needs for a day in one request: the same
 * recognition the single event card does lazily, plus the contract and
 * position lists that follow from it.
 *
 * Resolving those here matters — done from the browser it is three chained
 * round trips per row (recognise, then contracts, then positions), which is
 * what made opening the dialog take about twenty seconds.
 */
const BatchSchema = z.object({
  events: z
    .array(
      z.object({
        eventId: z.string().trim().min(1).max(400),
        title: z.string().trim().max(300),
        attendeeEmails: z.array(z.string().trim().max(200)).max(20).optional(),
      })
    )
    .min(1)
    .max(40),
});

type ResolvedOptions = {
  projectNumber: string | null;
  contracts: MariKeyPair[];
  contractId: number | null;
  contractVisible: string | null;
  positions: MariKeyPair[];
};

const EMPTY_OPTIONS: ResolvedOptions = {
  projectNumber: null,
  contracts: [],
  contractId: null,
  contractVisible: null,
  positions: [],
};

async function resolveOptions(
  projectNumber: string | null,
  recognisedContract: number | string | null
): Promise<ResolvedOptions> {
  const project = (projectNumber || "").trim();
  if (!project) return EMPTY_OPTIONS;

  let contracts: MariKeyPair[] = [];
  try {
    contracts = await listContractsForProject(project, false, null);
  } catch {
    return { ...EMPTY_OPTIONS, projectNumber: project };
  }

  // Recognition may name the contract by its visible number; the dropdown
  // keys on the internal id. A value that matches nothing is dropped rather
  // than booked.
  const hit =
    findMariKeyPair(contracts, recognisedContract) ??
    (contracts.length === 1 ? contracts[0] : undefined);
  const contractId = hit ? Number(hit.keyInternal) : null;
  if (contractId == null || !Number.isInteger(contractId) || contractId <= 0) {
    return {
      projectNumber: project,
      contracts,
      contractId: null,
      contractVisible: null,
      positions: [],
    };
  }

  let positions: MariKeyPair[] = [];
  try {
    positions = await listContractPositionsForTimeKeeping(contractId, null);
  } catch {
    positions = [];
  }
  return {
    projectNumber: project,
    contracts,
    contractId,
    contractVisible: hit?.keyVisible ?? null,
    positions,
  };
}

export async function POST(request: Request) {
  return withMariModule(async () => {
    if (!hasMariConfig()) {
      return NextResponse.json(
        { error: "MARI nicht konfiguriert.", results: [] },
        { status: 503 }
      );
    }
    let body: z.infer<typeof BatchSchema>;
    try {
      body = BatchSchema.parse(await request.json());
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Ungültige Anfrage" },
        { status: 400 }
      );
    }

    const results = await mapWithConcurrency(body.events, 5, async (event) => {
      const emails = event.attendeeEmails ?? [];
      const meetingKind = classifyEventMeetingKind(emails);
      if (!event.title && emails.length === 0) {
        return { eventId: event.eventId, booking: null, meetingKind, ...EMPTY_OPTIONS };
      }
      try {
        const hit = await recognizeEventBooking({
          title: event.title,
          attendeeEmails: emails,
        });
        const options = await resolveOptions(
          hit.booking?.projectNumber ?? null,
          hit.booking?.contractId ?? hit.booking?.contractVisible ?? null
        );
        return {
          eventId: event.eventId,
          booking: hit.booking,
          meetingKind: hit.meetingKind,
          ...options,
        };
      } catch {
        // One unrecognised row must not fail the whole day.
        return { eventId: event.eventId, booking: null, meetingKind, ...EMPTY_OPTIONS };
      }
    });

    return NextResponse.json({ results });
  });
}
