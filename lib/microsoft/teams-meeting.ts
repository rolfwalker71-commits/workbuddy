/** Graph fields that turn an Outlook event into a Teams meeting. */

export const OUTLOOK_TEAMS_PROVIDER = "teamsForBusiness" as const;

export type OutlookTeamsMeetingFields = {
  isOnlineMeeting: true;
  onlineMeetingProvider: typeof OUTLOOK_TEAMS_PROVIDER;
};

/** Timed events only — all-day Outlook items cannot be Teams meetings. */
export function outlookTeamsMeetingFields(
  allDay: boolean
): OutlookTeamsMeetingFields | Record<string, never> {
  if (allDay) return {};
  return {
    isOnlineMeeting: true,
    onlineMeetingProvider: OUTLOOK_TEAMS_PROVIDER,
  };
}
