import assert from "node:assert/strict";
import test from "node:test";
import {
  isOtherOrganizerGraphError,
  joinWebUrlFilterValues,
  parseGraphErrorMessage,
  transcriptFailureHint,
} from "./meeting-transcripts.ts";

test("joinWebUrlFilterValues keeps full URL and strips query/hash", () => {
  const values = joinWebUrlFilterValues(
    "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc/0?context=%7B%7D#frag"
  );
  assert.ok(
    values.includes(
      "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc/0?context=%7B%7D#frag"
    )
  );
  assert.ok(
    values.some((v) => v.includes("meetup-join") && !v.includes("?"))
  );
  assert.ok(values.every((v) => !v.includes("#frag") || v === values[0]));
});

test("parseGraphErrorMessage reads Graph JSON error", () => {
  assert.equal(
    parseGraphErrorMessage(
      JSON.stringify({
        error: { code: "Forbidden", message: "User is not the organizer." },
      })
    ),
    "User is not the organizer."
  );
  assert.equal(parseGraphErrorMessage(""), null);
});

test("isOtherOrganizerGraphError detects organizer wording", () => {
  assert.equal(
    isOtherOrganizerGraphError("User is not the organizer of the meeting"),
    true
  );
  assert.equal(isOtherOrganizerGraphError("throttled"), false);
});

test("transcriptFailureHint asks to reconnect only when scopes are missing", () => {
  assert.match(
    transcriptFailureHint({
      status: "forbidden",
      hasMeetingScope: false,
      hasTranscriptScope: false,
      hasChatMessages: false,
      meetingResolved: false,
    }),
    /Neu verbinden/
  );
  const withScopes = transcriptFailureHint({
    status: "forbidden",
    hasMeetingScope: true,
    hasTranscriptScope: true,
    graphBody: JSON.stringify({
      error: { message: "User is not the organizer." },
    }),
    hasChatMessages: false,
    meetingResolved: true,
  });
  assert.doesNotMatch(withScopes, /Neu verbinden/);
  assert.match(withScopes, /organisiert/);
  assert.match(withScopes, /not the organizer/);
});

test("transcriptFailureHint explains unresolved meetings without reconnect", () => {
  const hint = transcriptFailureHint({
    status: "not_found",
    hasMeetingScope: true,
    hasTranscriptScope: true,
    hasChatMessages: false,
    meetingResolved: false,
  });
  assert.doesNotMatch(hint, /Neu verbinden/);
  assert.match(hint, /anderen Organisator|Online-Meetings/);
});
