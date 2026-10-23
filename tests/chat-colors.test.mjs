import test from "node:test";
import assert from "node:assert/strict";
import { speakerColors, messageSpeaker, readableColor, normalizeColor } from "../chat-colors.mjs";
test("automatic speaker colors are distinct and independent of member iteration order", () => {
  const members = Object.fromEntries(Array.from({ length: 35 }, (_, i) => [`user${i}`, { characterId: `character${i}` }]));
  const colors = speakerColors(members);
  assert.equal(new Set(Object.values(colors)).size, 35);
  assert.deepEqual(colors, speakerColors(Object.fromEntries(Object.entries(members).reverse())));
});
test("manual colors are respected and automatic colors avoid them", () => {
  const colors = speakerColors({ dm: { chatColor: "#9bd5ff" }, player: { characterId: "hea" } });
  assert.equal(colors.dm, "#9BD5FF"); assert.notEqual(colors.player, colors.dm);
  assert.notEqual(readableColor("#000000"), "#000000"); assert.equal(normalizeColor('red; background:url(x)'), null);
});
test("chat keeps the character written by, while current character color changes remain live", () => {
  const message = { uid: "player", name: "Péťa", characterId: "hea", characterName: "Hea", chatColor: "#FFB5BE" };
  const members = { player: { characterId: "hea", characterName: "Hea", chatColor: "#A5E5F4" } };
  assert.equal(messageSpeaker(message, members).color, "#A5E5F4");
  members.player = { characterId: "vareth", characterName: "Vareth", chatColor: "#FFD88F" };
  const old = messageSpeaker(message, members);
  assert.equal(old.characterName, "Hea"); assert.equal(old.color, "#FFB5BE"); assert.equal(old.portrait, "");
  assert.equal(messageSpeaker({ uid: "player", name: "Péťa" }, members).characterName, "Vareth");
});
