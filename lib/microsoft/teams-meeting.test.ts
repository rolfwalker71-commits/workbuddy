import assert from "node:assert/strict";
import test from "node:test";
import { outlookTeamsMeetingFields } from "./teams-meeting.ts";

test("outlookTeamsMeetingFields is empty for all-day events", () => {
  assert.deepEqual(outlookTeamsMeetingFields(true), {});
});

test("outlookTeamsMeetingFields enables Teams for timed events", () => {
  assert.deepEqual(outlookTeamsMeetingFields(false), {
    isOnlineMeeting: true,
    onlineMeetingProvider: "teamsForBusiness",
  });
});
