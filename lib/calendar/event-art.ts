/**
 * Static 3dclay illustrations for recurring WorkBuddy calendar patterns.
 * Right = topic. Left = meeting format (Teams / Meet / Besprechung).
 */

export type EventArtSide = "left" | "right";

export type EventArtId =
  | "train"
  | "birthday"
  | "shift"
  | "support"
  | "standup"
  | "lunch"
  | "day-close"
  | "default"
  | "teams"
  | "meet"
  | "meeting";

export type EventArtAsset = {
  id: EventArtId;
  src: string;
  alt: string;
  label: string;
};

export type EventArtMatch = {
  right: EventArtAsset;
  left: EventArtAsset | null;
};

export type EventArtSubject = {
  id?: string | null;
  title?: string | null;
  location?: string | null;
  description?: string | null;
  meetUrl?: string | null;
  calendarType?: string | null;
  calendarName?: string | null;
};

const ART = "/calendar/art";

const ASSETS: Record<EventArtId, EventArtAsset> = {
  train: {
    id: "train",
    src: `${ART}/train.png`,
    alt: "Zug",
    label: "Reise",
  },
  birthday: {
    id: "birthday",
    src: `${ART}/birthday.png`,
    alt: "Geburtstag",
    label: "Geburtstag",
  },
  shift: {
    id: "shift",
    src: `${ART}/shift.png`,
    alt: "Schicht",
    label: "Schicht",
  },
  support: {
    id: "support",
    src: `${ART}/support.png`,
    alt: "Support",
    label: "Support",
  },
  standup: {
    id: "standup",
    src: `${ART}/standup.png`,
    alt: "Standup",
    label: "Sync",
  },
  lunch: {
    id: "lunch",
    src: `${ART}/lunch.png`,
    alt: "Mittagessen",
    label: "Essen",
  },
  "day-close": {
    id: "day-close",
    src: `${ART}/day-close.png`,
    alt: "Tagesabschluss",
    label: "Ritual",
  },
  default: {
    id: "default",
    src: `${ART}/default.png`,
    alt: "Termin",
    label: "Termin",
  },
  teams: {
    id: "teams",
    src: `${ART}/left-teams.png`,
    alt: "Microsoft Teams",
    label: "Teams",
  },
  meet: {
    id: "meet",
    src: `${ART}/left-meet.png`,
    alt: "Google Meet",
    label: "Meet",
  },
  meeting: {
    id: "meeting",
    src: `${ART}/left-meeting.png`,
    alt: "Besprechung",
    label: "Meeting",
  },
};

function haystack(input: EventArtSubject): string {
  return [
    input.id,
    input.title,
    input.location,
    input.description,
    input.meetUrl,
    input.calendarType,
    input.calendarName,
  ]
    .filter(Boolean)
    .join(" \n ")
    .toLowerCase();
}

function titleOf(input: EventArtSubject): string {
  return (input.title || "").toLowerCase();
}

export function resolveEventArtRight(input: EventArtSubject): EventArtAsset {
  const id = (input.id || "").toLowerCase();
  const title = titleOf(input);
  const type = (input.calendarType || "").toLowerCase();
  const text = haystack(input);

  if (id.startsWith("buddy-day-close") || /\btagesabschluss\b/.test(title)) {
    return ASSETS["day-close"];
  }
  if (type === "birthday" || /geburtstag|\bbirthday\b/.test(title)) {
    return ASSETS.birthday;
  }
  if (
    /\bbahnhof\b|\bzug\b|\bsbb\b|\bgleis\b|\bhbf?\b|\btrain\b|\brail(way)?\b/.test(
      text
    )
  ) {
    return ASSETS.train;
  }
  if (
    /\bf\d\b/.test(title) ||
    /\b(früh|spät|nacht|schicht|dienst|arbeitsplan)\b/.test(title) ||
    type === "work_valentyna"
  ) {
    return ASSETS.shift;
  }
  if (
    /\bsap\b|\bmaringo\b|\bticket\b|\bhana\b|\bsupport\b|\bbusiness\s*one\b|\bb1\b/.test(
      text
    )
  ) {
    return ASSETS.support;
  }
  if (
    /\bstandup\b|\bdaily\b|\bjour\s*fixe\b|\bweekly\b|\bwochencall\b|\bsync\b/.test(
      title
    )
  ) {
    return ASSETS.standup;
  }
  if (/\bmittag(essen)?\b|\blunch\b|\bessen\b/.test(title)) {
    return ASSETS.lunch;
  }
  return ASSETS.default;
}

export function resolveEventArtLeft(input: EventArtSubject): EventArtAsset | null {
  const text = haystack(input);
  const title = titleOf(input);
  if (/\bteams\b/.test(text) || /teams\.microsoft\.com/.test(text)) {
    return ASSETS.teams;
  }
  if (
    /\bgoogle\s*meet\b/.test(text) ||
    /meet\.google\.com/.test(text)
  ) {
    return ASSETS.meet;
  }
  if (
    /\b(besprechung|meeting|workshop|review|call|videokonferenz)\b/.test(
      title
    ) ||
    Boolean(input.meetUrl?.trim())
  ) {
    return ASSETS.meeting;
  }
  return null;
}

export function resolveEventArt(input: EventArtSubject): EventArtMatch {
  return {
    right: resolveEventArtRight(input),
    left: resolveEventArtLeft(input),
  };
}

export function eventArtKeywords(): Array<{
  id: EventArtId;
  side: EventArtSide;
  label: string;
  keywords: string[];
}> {
  return [
    {
      id: "day-close",
      side: "right",
      label: "Tagesabschluss",
      keywords: ["tagesabschluss", "buddy-day-close"],
    },
    {
      id: "birthday",
      side: "right",
      label: "Geburtstag",
      keywords: ["geburtstag", "birthday", "Kalendertyp birthday"],
    },
    {
      id: "train",
      side: "right",
      label: "Zug / Bahnhof",
      keywords: ["bahnhof", "zug", "sbb", "gleis", "hb", "hbf", "train"],
    },
    {
      id: "shift",
      side: "right",
      label: "Schicht / Arbeitsplan",
      keywords: ["f1–f9", "früh", "spät", "nacht", "schicht", "dienst", "arbeitsplan"],
    },
    {
      id: "support",
      side: "right",
      label: "Support / SAP / Maringo",
      keywords: ["sap", "maringo", "ticket", "hana", "support", "business one", "b1"],
    },
    {
      id: "standup",
      side: "right",
      label: "Standup / Weekly",
      keywords: ["standup", "daily", "jour fixe", "weekly", "wochencall", "sync"],
    },
    {
      id: "lunch",
      side: "right",
      label: "Essen",
      keywords: ["mittag", "mittagessen", "lunch", "essen"],
    },
    {
      id: "default",
      side: "right",
      label: "Standard-Termin",
      keywords: ["(Fallback)"],
    },
    {
      id: "teams",
      side: "left",
      label: "Microsoft Teams",
      keywords: ["teams", "teams.microsoft.com"],
    },
    {
      id: "meet",
      side: "left",
      label: "Google Meet",
      keywords: ["google meet", "meet.google.com"],
    },
    {
      id: "meeting",
      side: "left",
      label: "Besprechung",
      keywords: ["besprechung", "meeting", "workshop", "review", "call", "meetUrl"],
    },
  ];
}
