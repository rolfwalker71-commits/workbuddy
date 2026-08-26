import assert from "node:assert/strict";
import test from "node:test";
import { graphODataQuery, graphPath } from "./graph-query.ts";

test("graphODataQuery omits $top unless allowTop is set", () => {
  const withoutTop = new URLSearchParams(
    graphODataQuery({
      select: "id,displayName",
      top: 50,
    })
  );
  assert.equal(withoutTop.get("$select"), "id,displayName");
  assert.equal(withoutTop.get("$top"), null);
  assert.equal(graphODataQuery({ top: 40 }), "");
  assert.equal(
    graphODataQuery({ top: 40, allowTop: true }),
    new URLSearchParams({ $top: "40" }).toString()
  );
});

test("graphODataQuery keeps $select and $expand without $top", () => {
  const parsed = new URLSearchParams(
    graphODataQuery({
      select: "id,displayName,description,webUrl,membershipType",
      expand: "members",
      top: 50,
    })
  );
  assert.equal(
    parsed.get("$select"),
    "id,displayName,description,webUrl,membershipType"
  );
  assert.equal(parsed.get("$expand"), "members");
  assert.equal(parsed.get("$top"), null);
});

test("graphPath leaves joinedTeams without a query string", () => {
  assert.equal(graphPath("/me/joinedTeams"), "/me/joinedTeams");
  assert.equal(graphPath("/me/joinedTeams", ""), "/me/joinedTeams");
  assert.equal(
    graphPath(
      "/teams/t1/channels",
      graphODataQuery({ select: "id,displayName" })
    ),
    `/teams/t1/channels?${new URLSearchParams({ $select: "id,displayName" })}`
  );
});
