import assert from "node:assert/strict";
import test from "node:test";
import { parseWeatherHomeJson, weatherHomeSettingKey } from "./location-parse.ts";

test("parseWeatherHomeJson falls back to Altdorf when empty", () => {
  const loc = parseWeatherHomeJson(null);
  assert.equal(loc.label, "Altdorf");
  assert.ok(Number.isFinite(loc.lat));
  assert.ok(Number.isFinite(loc.lon));
});

test("parseWeatherHomeJson reads stored coordinates", () => {
  const loc = parseWeatherHomeJson(
    JSON.stringify({ query: "Luzern", label: "Luzern", lat: 47.05, lon: 8.31 })
  );
  assert.equal(loc.query, "Luzern");
  assert.equal(loc.label, "Luzern");
  assert.equal(loc.lat, 47.05);
  assert.equal(loc.lon, 8.31);
});

test("weatherHomeSettingKey is per user", () => {
  assert.equal(weatherHomeSettingKey(3), "weather_home_u3");
  assert.notEqual(weatherHomeSettingKey(3), weatherHomeSettingKey(4));
});

test("parseWeatherHomeJson ignores invalid JSON and coords", () => {
  assert.equal(parseWeatherHomeJson("not-json").label, "Altdorf");
  assert.equal(
    parseWeatherHomeJson(JSON.stringify({ label: "X", lat: "nope", lon: 1 })).label,
    "Altdorf"
  );
});
