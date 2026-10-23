import test from "node:test";
import assert from "node:assert/strict";
import { validateBetaConfig, availabilitySummary, calendarDays, validTimeRange, sessionLabel } from "../beta-core.mjs";
const betaConfig = {
  environment: "beta", mode: "emulator", expectedProjectId: "demo-kritfailer-beta",
  firebase: { apiKey: "demo-key", projectId: "demo-kritfailer-beta", authDomain: "demo-kritfailer-beta.firebaseapp.com", databaseURL: "https://demo-kritfailer-beta-default-rtdb.firebaseio.com" },
};
const onlineConfig = id => ({
  environment: "beta", mode: "online", expectedProjectId: id,
  firebase: { apiKey: "test", projectId: id, authDomain: `${id}.firebaseapp.com`, databaseURL: `https://${id}-default-rtdb.europe-west1.firebasedatabase.app` },
});
test("beta refuses the production project, mismatched services and hosted emulator mode", () => {
  assert.equal(validateBetaConfig(betaConfig, "localhost"), betaConfig);
  assert.throws(() => validateBetaConfig(betaConfig, "example.com"), /Lokální/);
  const bad = structuredClone(betaConfig); bad.firebase.projectId = "ktit-fail-generator";
  assert.throws(() => validateBetaConfig(bad, "localhost"), /ostrému/);
  const remote = { ...betaConfig, mode: "online", expectedProjectId: "my-kritfailer-beta", firebase: { apiKey: "test", projectId: "my-kritfailer-beta", authDomain: "my-kritfailer-beta.firebaseapp.com", databaseURL: "https://other-project-default-rtdb.europe-west1.firebasedatabase.app" } };
  assert.throws(() => validateBetaConfig(remote, "test.example"), /nepatří/);
});
test("online beta accepts the explicitly selected project without a naming convention", () => {
  const config = onlineConfig("kritfail-5ab0a");
  assert.equal(validateBetaConfig(config, "leechesen.github.io"), config);
  config.expectedProjectId = "different-project";
  assert.throws(() => validateBetaConfig(config, "leechesen.github.io"), /stejným ID/);
  assert.throws(() => validateBetaConfig(onlineConfig("ktit-fail-generator"), "leechesen.github.io"), /ostrému/);
});
test("calendar counts players separately from DM and distinguishes missing votes", () => {
  const members = { dm: {}, a: {}, b: {}, c: {} };
  assert.deepEqual(availabilitySummary(members, "dm", { dm: { status: "yes" }, a: { status: "yes" }, b: { status: "maybe" } }), { total: 3, yes: 1, maybe: 1, answered: 2, dm: "yes" });
});
test("calendar uses Monday-first months and handles leap years", () => {
  assert.equal(calendarDays(2024, 1).length, 29); assert.equal(calendarDays(2026, 1).length, 28);
  assert.equal(calendarDays(2026, 5)[0].offset, 0);
});
test("availability times and confirmed session stay explicit", () => {
  assert.equal(validTimeRange("18:00", "23:00"), true); assert.equal(validTimeRange("23:00", "18:00"), false); assert.equal(validTimeRange("99:00", ""), false);
  assert.ok(sessionLabel({ date: "2026-11-14", time: "18:00" }).endsWith("v 18:00"));
});
