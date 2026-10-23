import test from "node:test";
import assert from "node:assert/strict";
import { isPortrait, portraitMarkup, PORTRAIT_MAX_CHARS } from "../portraits.mjs";
test("portraits accept only bounded embedded raster images", () => {
  assert.equal(isPortrait("data:image/webp;base64,QUJDRA=="), true);
  assert.equal(isPortrait("data:image/jpeg;base64,/9j/"), true);
  for (const value of ["https://example.com/avatar.jpg", 'javascript:alert(1)', 'data:image/svg+xml;base64,QUJD', 'data:image/webp;base64,abc\" onerror=\"alert(1)', "data:image/webp;base64," + "A".repeat(PORTRAIT_MAX_CHARS)]) assert.equal(isPortrait(value), false);
});
test("portrait fallback and image labels escape character names", () => {
  assert.ok(!portraitMarkup('javascript:alert(1)', '<img onerror="x">').includes('<img '));
  const image = portraitMarkup("data:image/webp;base64,QUJDRA==", '\" onerror=\"x');
  assert.ok(image.includes('&quot;')); assert.ok(!image.includes(' onerror="x'));
});
