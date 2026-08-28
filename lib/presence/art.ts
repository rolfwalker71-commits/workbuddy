import {
  PRESENCE_STATUS_LABELS,
  type PresenceStatus,
} from "@/lib/presence/status";

export type PresenceIsoArtAsset = {
  status: PresenceStatus;
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

export function presenceIsoArt(
  status: PresenceStatus | null | undefined
): PresenceIsoArtAsset | null {
  if (!status) return null;
  return PRESENCE_ISO_ART[status];
}
