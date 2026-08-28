import assert from "node:assert/strict";
import test from "node:test";
import {
  TEAMS_DAY_CACHE_MAX,
  type TeamsDayCached,
} from "./teams-day-analysis-job.ts";

function pruneCache(
  entries: TeamsDayCached[],
  entry: TeamsDayCached,
  max = TEAMS_DAY_CACHE_MAX
): TeamsDayCached[] {
  const next = entries.filter((e) => e.dayIso !== entry.dayIso);
  next.push(entry);
  next.sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  return next.slice(0, Math.max(1, max));
}

function stub(dayIso: string, finishedAt: string): TeamsDayCached {
  return {
    dayIso,
    finishedAt,
    analysis: {
      summary: "x",
      clusters: [],
      tasks: [],
      events: [],
      replies: [],
    },
    usedAi: true,
    threadKeys: [`chat-${dayIso}`],
    chatsConsidered: 4,
    chatsAnalyzed: 2,
    channelsConsidered: 8,
    channelsAnalyzed: 1,
  };
}

test("teams day cache prune keeps newest 7 by finishedAt (Zurich ymd)", () => {
  let list: TeamsDayCached[] = [];
  for (let i = 1; i <= 9; i++) {
    const day = `2026-08-${String(i).padStart(2, "0")}`;
    list = pruneCache(list, stub(day, `${day}T12:00:00.000Z`));
  }
  assert.equal(list.length, 7);
  assert.ok(list.every((e) => e.dayIso >= "2026-08-03"));
  assert.equal(list[0]?.dayIso, "2026-08-09");
});

test("teams day cache upsert replaces same Zurich ymd", () => {
  let list = pruneCache([], stub("2026-08-28", "2026-08-28T10:00:00.000Z"));
  list = pruneCache(list, stub("2026-08-28", "2026-08-28T18:00:00.000Z"));
  assert.equal(list.length, 1);
  assert.equal(list[0]?.finishedAt, "2026-08-28T18:00:00.000Z");
  assert.equal(list[0]?.threadKeys[0], "chat-2026-08-28");
});
