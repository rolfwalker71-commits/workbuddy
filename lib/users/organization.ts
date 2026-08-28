export const USER_ORGANIZATIONS = ["CH", "AT", "DE", "MX"] as const;

export type UserOrganization = (typeof USER_ORGANIZATIONS)[number];

export const USER_ORGANIZATION_LABELS: Record<UserOrganization, string> = {
  CH: "ANG Schweiz",
  AT: "ANG Österreich",
  DE: "ANG Deutschland",
  MX: "ANG Mexiko",
};

export function isUserOrganization(
  raw: unknown
): raw is UserOrganization {
  return (
    raw === "CH" || raw === "AT" || raw === "DE" || raw === "MX"
  );
}

export function parseUserOrganization(
  raw: unknown
): UserOrganization | null {
  return isUserOrganization(raw) ? raw : null;
}
