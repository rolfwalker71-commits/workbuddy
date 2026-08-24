/**
 * Static 3dclay illustrations for recurring WorkBuddy calendar patterns.
 * Right = topic. Left = meeting format (Teams / Meet / Telefon / Besprechung).
 */

export type EventArtSide = "left" | "right";

export type EventArtId =
  | "train"
  | "birthday"
  | "shift"
  | "support"
  | "standup"
  | "morgencall"
  | "lunch"
  | "day-close"
  | "cruise"
  | "flight"
  | "hotel"
  | "car"
  | "vacation"
  | "doctor"
  | "hockey"
  | "sport"
  | "education"
  | "default"
  | "teams"
  | "meet"
  | "phone"
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
const EXT = "webp";

const ASSETS: Record<EventArtId, EventArtAsset> = {
  train: {
    id: "train",
    src: `${ART}/train.${EXT}`,
    alt: "Zug",
    label: "Reise",
  },
  birthday: {
    id: "birthday",
    src: `${ART}/birthday.${EXT}`,
    alt: "Geburtstag",
    label: "Geburtstag",
  },
  shift: {
    id: "shift",
    src: `${ART}/shift.${EXT}`,
    alt: "Schicht",
    label: "Schicht",
  },
  support: {
    id: "support",
    src: `${ART}/support.${EXT}`,
    alt: "Support",
    label: "Support",
  },
  standup: {
    id: "standup",
    src: `${ART}/standup.${EXT}`,
    alt: "Standup",
    label: "Sync",
  },
  morgencall: {
    id: "morgencall",
    src: `${ART}/morgencall.${EXT}`,
    alt: "Morgencall",
    label: "Morgencall",
  },
  lunch: {
    id: "lunch",
    src: `${ART}/lunch.${EXT}`,
    alt: "Mittagessen",
    label: "Essen",
  },
  "day-close": {
    id: "day-close",
    src: `${ART}/day-close.${EXT}`,
    alt: "Tagesabschluss",
    label: "Ritual",
  },
  cruise: {
    id: "cruise",
    src: `${ART}/cruise.${EXT}`,
    alt: "Kreuzfahrt",
    label: "Kreuzfahrt",
  },
  flight: {
    id: "flight",
    src: `${ART}/flight.${EXT}`,
    alt: "Flug",
    label: "Flug",
  },
  hotel: {
    id: "hotel",
    src: `${ART}/hotel.${EXT}`,
    alt: "Hotel",
    label: "Hotel",
  },
  car: {
    id: "car",
    src: `${ART}/car.${EXT}`,
    alt: "Auto",
    label: "Transfer",
  },
  vacation: {
    id: "vacation",
    src: `${ART}/vacation.${EXT}`,
    alt: "Ferien",
    label: "Ferien",
  },
  doctor: {
    id: "doctor",
    src: `${ART}/doctor.${EXT}`,
    alt: "Arzt",
    label: "Arzt",
  },
  hockey: {
    id: "hockey",
    src: `${ART}/hockey.${EXT}`,
    alt: "Hockey",
    label: "Hockey",
  },
  sport: {
    id: "sport",
    src: `${ART}/sport.${EXT}`,
    alt: "Sport",
    label: "Sport",
  },
  education: {
    id: "education",
    src: `${ART}/education.${EXT}`,
    alt: "Schulung",
    label: "Schulung",
  },
  default: {
    id: "default",
    src: `${ART}/default.${EXT}`,
    alt: "Termin",
    label: "Termin",
  },
  teams: {
    id: "teams",
    src: `${ART}/left-teams.${EXT}`,
    alt: "Microsoft Teams",
    label: "Teams",
  },
  meet: {
    id: "meet",
    src: `${ART}/left-meet.${EXT}`,
    alt: "Google Meet",
    label: "Meet",
  },
  phone: {
    id: "phone",
    src: `${ART}/left-phone.${EXT}`,
    alt: "Telefon",
    label: "Telefon",
  },
  meeting: {
    id: "meeting",
    src: `${ART}/left-meeting.${EXT}`,
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
  const cal = (input.calendarName || "").toLowerCase();
  const text = haystack(input);

  if (id.startsWith("buddy-day-close") || /\btagesabschluss\b/.test(title)) {
    return ASSETS["day-close"];
  }
  if (type === "birthday" || /geburtstag|\bbirthday\b/.test(title)) {
    return ASSETS.birthday;
  }
  if (/kreuzfahrt|\bseetag\b|allure of the seas/.test(title)) {
    return ASSETS.cruise;
  }
  if (/✈|flug:|\bflug\b|\bflughafen\b|\bairport\b|\bboarding\b/.test(title)) {
    return ASSETS.flight;
  }
  if (/🏨|\bhotel:|\bhotel\b/.test(title)) {
    return ASSETS.hotel;
  }
  if (
    /🚗|🚌|\bmietauto\b|\bmietwagen\b|\btransfer:\b|\btransfer von\b/.test(
      title
    )
  ) {
    return ASSETS.car;
  }
  if (
    /\bbahnhof\b|\bzug\b|\bsbb\b|\bgleis\b|\bhbf?\b|\btrain\b|\brail(way)?\b/.test(
      text
    )
  ) {
    return ASSETS.train;
  }
  if (
    /\b(ferien|urlaub|abwesend|kompensation|zeitausgleich)\b|\booo\b|out\s*of\s*office|urlaubskalender/.test(
      text
    )
  ) {
    return ASSETS.vacation;
  }
  if (
    /\b(zahnarzt|gynäkologie|gynaekologie|arzt|physio|therapie|spital|klinik|impfung)\b/.test(
      text
    )
  ) {
    return ASSETS.doctor;
  }
  if (
    /ambri|hockey|gottardo arena|swiss life arena|tissot arena/.test(text) ||
    /ambri/.test(cal)
  ) {
    return ASSETS.hockey;
  }
  if (/🏃|\babendlauf\b|\b(jogging|laufen|lauf)\b/.test(title)) {
    return ASSETS.sport;
  }
  if (
    /\bf\d\b/.test(title) ||
    /\b(früh|spät|nacht|schicht|dienst|arbeitsplan)\b/.test(title) ||
    type === "work_valentyna"
  ) {
    return ASSETS.shift;
  }
  if (
    /virtual\s*classroom|\b(schulung|weiterbildung|zertifizierung|webinar|ausbildung|seminar)\b/.test(
      text
    )
  ) {
    return ASSETS.education;
  }
  if (
    /\bsap\b|\bmaringo\b|\bticket\b|\bhana\b|\bsupport\b|\bbusiness\s*one\b|\bb1\b/.test(
      text
    )
  ) {
    return ASSETS.support;
  }
  if (/\bmorgencall\b/.test(title)) {
    return ASSETS.morgencall;
  }
  if (
    /\bstandup\b|\bdaily\b|\bjour\s*fixe\b|\bweekly\b|\bwochencall\b|\bsync\b|\bmonatstreffen\b|\bpartner\s*call\b|\btl\s*meeting\b|\binsight\b|\babstimmung\b/.test(
      title
    )
  ) {
    return ASSETS.standup;
  }
  if (/\bmittag(essen)?\b|\blunch\b|\bessen\b|\bnachtessen\b|\babendessen\b/.test(title)) {
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
  if (/\b(telefonisch|telefon|anruf|rückruf)\b|\btel\.\b/.test(title)) {
    return ASSETS.phone;
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
      id: "cruise",
      side: "right",
      label: "Kreuzfahrt",
      keywords: ["kreuzfahrt", "seetag"],
    },
    {
      id: "flight",
      side: "right",
      label: "Flug",
      keywords: ["flug", "flughafen", "airport"],
    },
    {
      id: "hotel",
      side: "right",
      label: "Hotel",
      keywords: ["hotel"],
    },
    {
      id: "car",
      side: "right",
      label: "Auto / Transfer",
      keywords: ["mietauto", "mietwagen", "transfer"],
    },
    {
      id: "train",
      side: "right",
      label: "Zug / Bahnhof",
      keywords: ["bahnhof", "zug", "sbb", "gleis", "hb", "hbf", "train"],
    },
    {
      id: "vacation",
      side: "right",
      label: "Ferien",
      keywords: ["ferien", "urlaub", "urlaubskalender"],
    },
    {
      id: "doctor",
      side: "right",
      label: "Arzt",
      keywords: ["zahnarzt", "arzt", "gynäkologie", "spital"],
    },
    {
      id: "hockey",
      side: "right",
      label: "Hockey",
      keywords: ["ambri", "hockey", "gottardo arena"],
    },
    {
      id: "sport",
      side: "right",
      label: "Sport",
      keywords: ["abendlauf", "laufen", "lauf"],
    },
    {
      id: "shift",
      side: "right",
      label: "Schicht / Arbeitsplan",
      keywords: ["f1–f9", "früh", "spät", "nacht", "schicht", "dienst", "arbeitsplan"],
    },
    {
      id: "education",
      side: "right",
      label: "Schulung",
      keywords: ["virtual classroom", "schulung", "webinar"],
    },
    {
      id: "support",
      side: "right",
      label: "Support / SAP / Maringo",
      keywords: ["sap", "maringo", "ticket", "hana", "support", "business one", "b1"],
    },
    {
      id: "morgencall",
      side: "right",
      label: "Morgencall",
      keywords: ["morgencall"],
    },
    {
      id: "standup",
      side: "right",
      label: "Standup / Weekly",
      keywords: ["standup", "daily", "jour fixe", "weekly", "wochencall", "sync", "monatstreffen"],
    },
    {
      id: "lunch",
      side: "right",
      label: "Essen",
      keywords: ["mittag", "mittagessen", "lunch", "essen", "nachtessen"],
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
      id: "phone",
      side: "left",
      label: "Telefon",
      keywords: ["telefonisch", "telefon", "anruf"],
    },
    {
      id: "meeting",
      side: "left",
      label: "Besprechung",
      keywords: ["besprechung", "meeting", "workshop", "review", "call", "meetUrl"],
    },
  ];
}
