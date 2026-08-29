import assert from "node:assert/strict";
import test from "node:test";
import {
  activityEventLabel,
  formatActivityDetail,
} from "./activity-log-display.ts";

test("activityEventLabel maps known events and falls back to raw", () => {
  assert.equal(activityEventLabel("login"), "Anmeldung");
  assert.equal(activityEventLabel("logout"), "Abmeldung");
  assert.equal(activityEventLabel("session_expired"), "Session abgelaufen");
  assert.equal(activityEventLabel("ticket_analysis"), "Ticketanalyse");
  assert.equal(activityEventLabel("mail_day_analysis"), "AI-Tagesanalyse");
  assert.equal(activityEventLabel("unknown"), "unknown");
});

test("formatActivityDetail formats ticket analysis", () => {
  assert.equal(
    formatActivityDetail({
      event: "ticket_analysis",
      detail: { issueId: 144647, ok: true },
    }),
    "Ticket #144647"
  );
  assert.equal(
    formatActivityDetail({
      event: "ticket_analysis",
      detail: { issueId: 144647, ok: false },
    }),
    "Ticket #144647 · fehlgeschlagen"
  );
  assert.equal(
    formatActivityDetail({
      event: "ticket_analysis",
      detail: { error: "timeout" },
    }),
    "fehlgeschlagen"
  );
  assert.equal(
    formatActivityDetail({ event: "ticket_analysis", detail: null }),
    "—"
  );
});

test("formatActivityDetail formats mail day analysis with provider", () => {
  assert.equal(
    formatActivityDetail({
      event: "mail_day_analysis",
      detail: {
        provider: "microsoft",
        fromYmd: "2026-08-28",
        toYmd: "2026-08-29",
      },
    }),
    "28.08.–29.08. · Outlook"
  );
  assert.equal(
    formatActivityDetail({
      event: "mail_day_analysis",
      detail: {
        provider: "google",
        fromYmd: "2026-08-28",
        toYmd: "2026-08-28",
      },
    }),
    "28.08. · Gmail"
  );
  assert.equal(
    formatActivityDetail({
      event: "mail_day_analysis",
      detail: {
        provider: "outlook",
        fromYmd: "2026-08-28",
        toYmd: "2026-08-29",
        ok: false,
      },
    }),
    "28.08.–29.08. · Outlook · fehlgeschlagen"
  );
  assert.equal(
    formatActivityDetail({ event: "login", detail: { extra: true } }),
    "—"
  );
});
