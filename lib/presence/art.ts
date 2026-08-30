import {
  PRESENCE_STATUS_LABELS,
  type PresenceStatus,
} from "@/lib/presence/status";

/** Display-only art key. Not a stored PresenceStatus. */
export type PresenceIsoArtKey = PresenceStatus | "unset";

export type PresenceIsoArtAsset = {
  status: PresenceIsoArtKey;
  src: string;
  alt: string;
};

const ART = "/presence/iso";

export const PRESENCE_ISO_ART: Record<PresenceStatus, PresenceIsoArtAsset> = {
  office: {
    status: "office",
    src: `${ART}/office.webp`,
    alt: PRESENCE_STATUS_LABELS.office,
  },
  home: {
    status: "home",
    src: `${ART}/home.webp`,
    alt: PRESENCE_STATUS_LABELS.home,
  },
  sick: {
    status: "sick",
    src: `${ART}/sick.webp`,
    alt: PRESENCE_STATUS_LABELS.sick,
  },
  vacation: {
    status: "vacation",
    src: `${ART}/vacation.webp`,
    alt: PRESENCE_STATUS_LABELS.vacation,
  },
  absent: {
    status: "absent",
    src: `${ART}/absent.webp`,
    alt: PRESENCE_STATUS_LABELS.absent,
  },
};

/** Open / unset day — never written to presence matching or storage. */
export const PRESENCE_UNSET_ART: PresenceIsoArtAsset = {
  status: "unset",
  src: `${ART}/unset.webp`,
  alt: "Offen",
};

export function presenceIsoArt(
  status: PresenceStatus | null | undefined
): PresenceIsoArtAsset {
  if (!status) return PRESENCE_UNSET_ART;
  return PRESENCE_ISO_ART[status];
}
