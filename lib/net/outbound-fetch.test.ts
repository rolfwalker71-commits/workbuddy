import assert from "node:assert/strict";
import test from "node:test";
import {
  formatOutboundNetworkError,
  isTransientNetworkError,
} from "./outbound-fetch.ts";

test("fetch failed is treated as a transient Microsoft outage", () => {
  const err = new Error("fetch failed");
  assert.equal(isTransientNetworkError(err), true);
  assert.match(
    formatOutboundNetworkError(err, "Microsoft Graph").message,
    /Microsoft Graph ist gerade nicht erreichbar/
  );
});

test("ECONNRESET on the cause is transient", () => {
  const err = Object.assign(new Error("fetch failed"), {
    cause: Object.assign(new Error("connect"), { code: "ENETUNREACH" }),
  });
  assert.equal(isTransientNetworkError(err), true);
  assert.match(
    formatOutboundNetworkError(err, "Microsoft-Anmeldung").message,
    /ENETUNREACH/
  );
});

test("application errors stay unchanged", () => {
  const err = new Error("Kein Refresh-Token erhalten.");
  assert.equal(isTransientNetworkError(err), false);
  assert.equal(
    formatOutboundNetworkError(err, "Microsoft Graph").message,
    "Kein Refresh-Token erhalten."
  );
});
