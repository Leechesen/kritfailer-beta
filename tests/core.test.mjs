import test from "node:test";
import assert from "node:assert/strict";
import { chooseResult, discoverSeverities, weightedChoice, recentEvents, makeEvent, escapeHtml } from "../critfail-core.mjs";

const data = { "Útok": { Melee: { "Sranda": [{ effect: "A", roleplay: ["RP1", "RP2"], weight: 1 }, { effect: "B", weight: 3 }], "Vážný": [{ effect: "C", roleplay: [], weight: 1 }] } }, Skill: { Wisdom: { Perception: { "Sranda": [{ effect: "D", weight: 1 }] } } } };

test("DM must select a difficulty before any result can be generated", () => {
  assert.throws(() => chooseResult(data, "attack:Melee", { severity: "", revision: 0 }), /DM/);
});
test("every player uses the selected room severity and its revision", () => {
  const result = chooseResult(data, "attack:Melee", { severity: "Vážný", revision: 4 }, () => 0);
  assert.equal(result.effect, "C"); assert.equal(result.severity, "Vážný"); assert.equal(result.settingsRevision, 4);
});
test("missing skill/severity combinations do not fall back to a different difficulty", () => {
  assert.throws(() => chooseResult(data, "skill:Wisdom:Perception", { severity: "Vážný", revision: 1 }), /kombinaci/);
});
test("weighted results use the full relative weight, including fractions", () => {
  const pool = [{ id: 1, weight: 1 }, { id: 2, weight: 3 }];
  const counts = [0, 0];
  for (let i = 0; i < 100; i++) counts[weightedChoice(pool, () => (i + 0.5) / 100).id - 1]++;
  assert.deepEqual(counts, [25, 75]);
  assert.equal(weightedChoice([{ id: 1, weight: 0.25 }, { id: 2, weight: 0.75 }], () => 0.5).id, 2);
});
test("invalid weights fail instead of silently changing their meaning", () => {
  for (const weight of [0, -1, "2", Infinity, NaN]) assert.throws(() => weightedChoice([{ effect: "bad", weight }]));
});
test("difficulty labels are discovered from Excel data", () => {
  assert.deepEqual(discoverSeverities(data), ["Sranda", "Vážný"]);
});
test("the stored shared result retains actor, target and original room settings", () => {
  const result = chooseResult(data, "attack:Melee", { severity: "Sranda", revision: 3 }, () => 0);
  const event = makeEvent({ result, actorId: "player", actorName: "Ondra", datasetVersion: "a".repeat(64), ts: 123 });
  assert.equal(event.targetId, "player"); assert.equal(event.actorId, "player");
  assert.deepEqual(event.roleplay, ["RP1"]); assert.equal(event.settingsRevision, 3);
});
test("one roleplay uses the first filled column and accepts a missing roleplay", () => {
  const copy = structuredClone(data);
  const entry = copy["Útok"].Melee.Sranda[0];
  entry.roleplay = ["  ", "Náhradní roleplay"];
  assert.deepEqual(chooseResult(copy, "attack:Melee", { severity: "Sranda", revision: 1 }, () => 0).roleplay, ["Náhradní roleplay"]);
  entry.roleplay = ["", ""];
  assert.deepEqual(chooseResult(copy, "attack:Melee", { severity: "Sranda", revision: 1 }, () => 0).roleplay, []);
});
test("resending an older result sends only one roleplay", () => {
  const result = { effect: "Efekt", severity: "Sranda", roleplay: ["První", "Druhý"] };
  const event = makeEvent({ result, actorId: "dm", actorName: "DM", targetId: "player", targetName: "Ondra", datasetVersion: "a".repeat(64), kind: "assignment", ts: 123 });
  assert.deepEqual(event.roleplay, ["První"]);
});
test("DM history retains simultaneous results from different players", () => {
  const tree = { a: { x: { effect: "A", ts: 5 } }, b: { z: { effect: "B", ts: 5 }, y: { effect: "C", ts: 1 } } };
  assert.deepEqual(recentEvents(tree, 2).map(e => e.id), ["z", "x"]);
});
test("result text and names cannot become HTML", () => {
  assert.equal(escapeHtml('<img src=x onerror="x">'), "&lt;img src=x onerror=&quot;x&quot;&gt;");
});
