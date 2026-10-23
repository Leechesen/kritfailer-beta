import { test } from "node:test";
import assert from "node:assert/strict";
import { OVERLAY_THEMES, DISPLAY_MS, normalizeOverlayTheme, splitOverlayEffect } from "../overlay-themes.mjs";

test("seven selectable themes and a safe default", () => {
  assert.equal(new Set(OVERLAY_THEMES.map(theme => theme.id)).size, 7);
  for (const theme of OVERLAY_THEMES) assert.equal(normalizeOverlayTheme(theme.id), theme.id);
  assert.equal(normalizeOverlayTheme("unknown"), "grimoire");
  assert.equal(DISPLAY_MS, 20000);
});
test("separates immediate damage from an ongoing penalty without losing either", () => {
  assert.deepEqual(splitOverlayEffect("Utrpíš 3d6 drtivého poškození. Příští hod má postih −3."), { damage: "Utrpíš 3d6 drtivého poškození.", consequence: "Příští hod má postih −3." });
  assert.deepEqual(splitOverlayEffect("Utrpíš 1d6 drtivého poškození a do začátku svého příštího tahu máš −1 k AC."), { damage: "Utrpíš 1d6 drtivého poškození.", consequence: "do začátku svého příštího tahu máš −1 k AC." });
  assert.deepEqual(splitOverlayEffect("Utrpíš 4d6 psychického poškození."), { damage: "Utrpíš 4d6 psychického poškození.", consequence: "" });
});
test("future damage stays with its condition; ordinary penalties stay complete", () => {
  for (const text of ["První zásah, který utrpíš do začátku svého příštího tahu, způsobí navíc 1d6 drtivého poškození.", "Do konce svého příštího tahu sniž poškození příštího zásahu o 1.", "Příští ověření má postih −2."]) {
    assert.deepEqual(splitOverlayEffect(text), { damage: "", consequence: text });
  }
});
