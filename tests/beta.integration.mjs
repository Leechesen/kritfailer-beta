import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
const root = path.resolve(import.meta.dirname, ".."), namespace = "demo-kritfailer-beta-default-rtdb";
const emulatorConfig = { environment: "beta", mode: "emulator", expectedProjectId: "demo-kritfailer-beta", firebase: { apiKey: "demo-kritfailer-beta-key", projectId: "demo-kritfailer-beta", authDomain: "demo-kritfailer-beta.firebaseapp.com", databaseURL: "https://demo-kritfailer-beta-default-rtdb.firebaseio.com" }, emulators: { authPort: 9099, databasePort: 9001 } };
const base = `http://127.0.0.1:9001`, authBase = "http://127.0.0.1:9099";
const api = async (route, method = "GET", value, token) => {
  const response = await fetch(`${base}/${route}.json?ns=${namespace}${token ? `&auth=${encodeURIComponent(token)}` : ""}`, { method, headers: token ? { "Content-Type": "application/json" } : { Authorization: "Bearer owner", "Content-Type": "application/json" }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
  const data = await response.json(); return { status: response.status, data };
};
await api(".settings/rules", "PUT", JSON.parse(await fs.readFile(path.join(root, "database.rules.json"), "utf8")));
await api("", "DELETE");
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost"), file = path.resolve(root, "." + (url.pathname === "/" ? "/index.html" : url.pathname));
    if (!file.startsWith(root + path.sep)) throw new Error("path");
    response.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png" })[path.extname(file)] || "text/plain");
    if (url.pathname === "/beta-config.mjs") return response.end(`export const betaConfig = ${JSON.stringify(emulatorConfig)};`);
    response.end(await fs.readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const executablePath = process.env.KRITFAILER_CHROMIUM_EXECUTABLE;
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const errors = [];
async function pageFor(url = origin) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin === "https://www.gstatic.com" && url.pathname.startsWith("/firebasejs/10.7.1/")) return route.fulfill({ path: path.join(root, "node_modules/firebase", url.pathname.split("/").at(-1)), contentType: "text/javascript" });
    if (["127.0.0.1", "localhost"].includes(url.hostname)) return route.continue();
    errors.push(`Unexpected external request: ${url.origin}`); return route.abort();
  });
  const page = await context.newPage(); page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") console.log("BROWSER", m.text()); });
  await page.goto(url); if (url === origin) await page.locator("#authView").waitFor({ state: "visible" }); return page;
}
async function signup(page, name, email) {
  await page.locator("#registerTab").click(); await page.locator("#nickname").fill(name); await page.locator("#email").fill(email); await page.locator("#password").fill("BetaTest-2026!"); await page.locator("#authSubmit").click(); await page.locator("#portal").waitFor({ state: "visible" });
}
async function character(page, name) {
  await page.locator("#newCharacter").click(); await page.locator("#characterName").fill(name); await page.locator("#characterClass").fill("Bojovník"); await page.locator("#characterForm button[type=submit], #characterForm > button").click(); await page.locator("#characterDialog").waitFor({ state: "hidden" });
}
async function waitText(page, selector, text) { await page.waitForFunction(({ selector, text }) => document.querySelector(selector)?.textContent.includes(text), { selector, text }); }
async function loginToken(email) {
  const response = await fetch(`${authBase}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-kritfailer-beta-key`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "BetaTest-2026!", returnSecureToken: true }) });
  const data = await response.json(); assert.ok(data.idToken, JSON.stringify(data)); return data;
}
try {
  const suffix = Date.now(), dm = await pageFor(), p1 = await pageFor(), outsider = await pageFor();
  const emails = { dm: `dm-${suffix}@test.local`, p1: `player-${suffix}@test.local`, outsider: `outsider-${suffix}@test.local` };
  await signup(dm, "Ondra DM", emails.dm); await signup(p1, "Péťa", emails.p1); await signup(outsider, "Návštěvník", emails.outsider);
  await character(p1, "Hea"); await character(p1, "Vareth");
  const dmAuth = await loginToken(emails.dm), p1Auth = await loginToken(emails.p1), outsiderAuth = await loginToken(emails.outsider);
  const characterData = (await api(`beta/characters/${p1Auth.localId}`)).data;
  const hea = Object.keys(characterData).find(id => characterData[id].name === "Hea"), vareth = Object.keys(characterData).find(id => characterData[id].name === "Vareth");
  async function campaign(name) {
    await dm.locator("#newCampaign").click(); await dm.locator("#newCampaignName").fill(name); await dm.locator("#campaignForm > button").click();
    await waitText(dm, "#campaignName", name); await dm.waitForFunction(() => document.querySelector("#inviteCode").value.length === 32);
    const campaigns = (await api("beta/campaigns")).data, id = Object.keys(campaigns).find(id => campaigns[id].meta.name === name);
    return { id, code: campaigns[id].meta.inviteCode };
  }
  async function join(campaign, characterId) {
    await p1.locator("#joinCampaign").click(); await p1.locator("#joinCode").fill(campaign.code); await p1.locator("#joinCharacter").selectOption(characterId); await p1.locator("#joinForm > button").click();
    await p1.waitForFunction(id => document.querySelector(`.campaign-button[data-campaign-id="${id}"]`)?.classList.contains("selected"), campaign.id);
  }
  const first = await campaign("Testovací Kroniky"); await join(first, hea);
  assert.equal(await p1.locator("#chat").isVisible(), true);
  assert.deepEqual(await p1.locator("[data-tab]").evaluateAll(elements => elements.map(e => e.dataset.tab)), ["chat", "calendar", "overview"]);
  const second = await campaign("Stíny severu"); await join(second, hea);
  await waitText(p1, `[data-character-id="${hea}"]`, "Stíny severu"); await waitText(p1, `[data-character-id="${hea}"]`, "Testovací Kroniky");
  const mirror = await p1.context().newPage(); await mirror.goto(origin); await mirror.locator("#campaignView").waitFor({ state: "visible" });
  await p1.locator('[data-tab="overview"]').click(); await p1.locator("#campaignCharacter").selectOption(vareth); await p1.locator("#selectCharacterForm > button").click();
  await waitText(mirror, `[data-campaign-id="${second.id}"]`, "Vareth"); await waitText(mirror, `[data-character-id="${vareth}"]`, "Stíny severu");
  assert.equal((await mirror.locator(`[data-character-id="${hea}"]`).textContent()).includes("Stíny severu"), false);
  await p1.locator(`[data-campaign-id="${first.id}"]`).click(); await dm.locator(`[data-campaign-id="${first.id}"]`).click();
  await waitText(p1, "#campaignName", "Testovací Kroniky"); await waitText(dm, "#campaignName", "Testovací Kroniky");
  assert.equal(await p1.locator("#chat").isVisible(), true);
  assert.equal(await p1.locator(".campaign-button").count(), 2);
  assert.equal((await api(`beta/campaigns/${first.id}`, "GET", undefined, outsiderAuth.idToken)).status, 401);
  assert.equal((await api(`beta/characters/${p1Auth.localId}`, "GET", undefined, dmAuth.idToken)).status, 401);
  console.log("PASS multiple campaigns, per-campaign characters, one character in several campaigns, live sidebar associations and chat-first navigation");
  const id = first.id, stamp = { ".sv": "timestamp" };
  await p1.locator("#message").fill("Ahoj družino"); await p1.locator("#message").press("Control+Enter");
  assert.equal(await p1.locator("#message").inputValue(), "Ahoj družino\n");
  assert.equal(await p1.locator(".message").count(), 0);
  await p1.locator("#message").pressSequentially("Druhy radek <img src=x onerror=alert(1)>"); await p1.locator("#message").press("Enter");
  await waitText(dm, "#messages", "Druhy radek"); assert.equal(await dm.locator("#messages img").count(), 0);
  assert.equal(await dm.locator(".edit-message").count(), 0);
  const originalMessages = (await api(`beta/campaigns/${id}/chat`)).data, messageId = Object.keys(originalMessages)[0], originalMessage = originalMessages[messageId];
  await dm.locator("#message").fill("Domluvíme další sezení."); await dm.locator("#message").press("Enter"); await waitText(p1, "#messages", "Domluvíme");
  await p1.locator(`[data-message-id="${messageId}"] .edit-message`).click(); await p1.locator("#message").fill("Opravená zpráva\nDruhý řádek"); await p1.locator("#message").press("Enter");
  await waitText(dm, `[data-message-id="${messageId}"]`, "Opravená zpráva");
  assert.equal(await dm.locator(`[data-message-id="${messageId}"] .edited`).count(), 1);
  const edited = (await api(`beta/campaigns/${id}/chat/${messageId}`)).data;
  assert.equal(edited.ts, originalMessage.ts); assert.equal(edited.uid, p1Auth.localId); assert.ok(edited.editedAt >= edited.ts);
  assert.equal(await dm.locator(".message").first().getAttribute("data-message-id"), messageId);
  const messagePath = `beta/campaigns/${id}/chat/${messageId}`;
  for (const [patch, token] of [[{ body: "Cizí úprava", editedAt: stamp }, dmAuth.idToken], [{ body: "Cizí úprava", editedAt: stamp }, outsiderAuth.idToken], [{ uid: dmAuth.localId, editedAt: stamp }, p1Auth.idToken], [{ name: "Jiný autor", editedAt: stamp }, p1Auth.idToken], [{ ts: 1, editedAt: stamp }, p1Auth.idToken], [{ body: "Bez razítka" }, p1Auth.idToken]]) {
    assert.equal((await api(messagePath, "PATCH", patch, token)).status, 401);
  }
  assert.equal((await api(messagePath, "DELETE", undefined, p1Auth.idToken)).status, 401);
  await p1.locator("#message").fill("Rozpracovaný text"); await p1.locator(`[data-message-id="${messageId}"] .edit-message`).click(); await p1.locator("#message").fill("Zrušená změna"); await p1.locator("#cancelMessageEdit").click();
  assert.equal(await p1.locator("#message").inputValue(), "Rozpracovaný text"); await p1.locator("#message").fill("");
  await p1.reload(); await p1.locator("#campaignView").waitFor({ state: "visible" }); assert.equal(await p1.locator("#chat").isVisible(), true); await waitText(p1, "#messages", "Opravená zpráva");
  console.log("PASS Enter sends, Ctrl+Enter inserts a line, live author-only edits, edit cancellation, immutable authors/timestamps and persisted chat");
  await dm.locator('[data-tab="calendar"]').click(); await p1.locator('[data-tab="calendar"]').click();
  await dm.locator("#nextMonth").click(); await p1.locator("#nextMonth").click();
  await p1.locator('[data-day="14"]').click(); await p1.waitForFunction(() => document.querySelector('[data-day="14"]').getAttribute("aria-pressed") === "true");
  await p1.locator('[data-availability-day="14"]').waitFor(); assert.equal(await p1.locator("#availabilityDetail").isVisible(), true);
  await p1.locator('[data-day="20"]').click(); await dm.locator('[data-day="14"]').click(); await dm.locator('[data-day="20"]').click(); await dm.locator('[data-day="10"]').click();
  await dm.waitForFunction(() => document.querySelector('[data-day="14"]').classList.contains("everyone"));
  const target = await dm.locator('.session-candidate[data-date$="-14"]').getAttribute("data-date"), targetMonth = target.slice(0, 7);
  assert.ok((await dm.locator('[data-day="14"] .count').textContent()).includes("1/1")); assert.equal(await p1.locator("#sessionControls").isVisible(), false);
  await p1.locator('[data-availability-day="14"]').click(); await p1.locator("#availableFrom").fill("18:00"); await p1.locator("#availableUntil").fill("22:00"); await p1.locator("#availabilityNote").fill("Po práci"); await p1.locator("#availabilityForm button").first().click();
  const targetRow = dm.locator(`.session-candidate[data-date="${target}"]`);
  await waitText(dm, `.session-candidate[data-date="${target}"]`, "Po práci");
  await targetRow.locator('input[name="start"]').fill("19:30"); await targetRow.locator('input[name="note"]').fill("U herního stolu");
  await p1.locator('[data-day="20"]').click(); await p1.waitForFunction(() => !document.querySelector('[data-availability-day="20"]'));
  await waitText(dm, `.session-candidate[data-date="${targetMonth}-20"] .candidate-count`, "0/1");
  assert.equal(await targetRow.locator('input[name="start"]').inputValue(), "19:30"); assert.equal(await targetRow.locator('input[name="note"]').inputValue(), "U herního stolu");
  await dm.locator("#candidateSort").selectOption("players");
  const ranked = await dm.locator(".session-candidate").evaluateAll(rows => rows.map(r => r.dataset.date));
  assert.deepEqual(ranked, [target, `${targetMonth}-10`, `${targetMonth}-20`]);
  await dm.locator("#candidateSort").selectOption("date");
  assert.equal(await dm.locator(".session-candidate").first().getAttribute("data-date"), `${targetMonth}-10`);
  await targetRow.locator("button").click(); await waitText(p1, "#nextSession", "19:30"); await waitText(p1, "#sessionNote", "U herního stolu");
  const badVote = { status: "yes", from: "", until: "", note: "", updatedAt: stamp };
  assert.equal((await api(`beta/campaigns/${id}/availability/${targetMonth}/14/${dmAuth.localId}`, "PUT", badVote, p1Auth.idToken)).status, 401);
  const badSession = { date: target, time: "18:00", timezone: "Europe/Prague", note: "", updatedBy: p1Auth.localId, updatedAt: stamp };
  assert.equal((await api(`beta/campaigns/${id}/session`, "PUT", badSession, p1Auth.idToken)).status, 401);
  await dm.locator("#nextMonth").click(); await dm.locator('[data-day="05"]').click();
  await dm.waitForFunction(() => document.querySelectorAll(".session-candidate").length === 4);
  assert.equal(await dm.locator(`.session-candidate[data-date="${target}"]`).count(), 1);
  await p1.reload(); await p1.locator("#campaignView").waitFor({ state: "visible" }); await waitText(p1, "#nextSession", "19:30");
  console.log("PASS click-to-toggle days, optional details, live counts, cross-month DM list, date/attendance sorting and per-day session confirmation");
  await dm.locator("#play").click(); await dm.locator("#dmPanel").waitFor({ state: "visible" }); await dm.locator("#severityBtns button").first().click(); await dm.locator("#generator [data-choice]").first().click(); await waitText(dm, "#resHeader", "Náhled pro DM");
  assert.equal((await api(`roomsV2/${id}/overlay`)).data, null);
  await p1.locator("#play").click(); await p1.locator("#playerPanel").waitFor({ state: "visible" }); await p1.locator("#playerGenerator [data-choice]").first().click(); await p1.locator("#playerResult .res-effect").waitFor();
  const published = (await api(`roomsV2/${id}/overlay`)).data; assert.equal(published.player, "Hea");
  const viewer = await pageFor(`${origin}/overlay.html?room=${encodeURIComponent(id)}`); await viewer.setViewportSize({ width: 3840, height: 2160 }); await viewer.locator("#overlay-wrap.visible").waitFor();
  assert.equal((await viewer.locator("#panel").boundingBox()).width, 3840);
  await dm.locator("#overlaySettings").evaluate(element => element.open = true);
  for (const theme of ["grimoire", "inferno", "astral", "parchment", "nordic", "comic", "ice"]) { await dm.locator(`[data-overlay-theme="${theme}"]`).click(); await viewer.waitForFunction(theme => document.querySelector("#panel").dataset.theme === theme, theme); }
  await viewer.waitForFunction(() => !document.querySelector("#overlay-wrap").classList.contains("visible"), null, { timeout: 25000 });
  console.log("PASS campaign-specific generator characters, private DM drafts and full 4K overlay with seven themes and 20-second expiry");
  await dm.goto(origin); await dm.locator("#campaignView").waitFor({ state: "visible" }); await dm.locator('[data-tab="overview"]').click();
  await dm.locator("#dmSelect").selectOption(p1Auth.localId); await dm.locator("#dmForm > button").click(); await waitText(dm, "#roleLabel", "Hráč");
  await p1.goto(origin); await p1.locator("#campaignView").waitFor({ state: "visible" }); await waitText(p1, "#roleLabel", "Dungeon Master");
  assert.equal((await api(`roomsV2/${id}/dm`)).data, p1Auth.localId);
  assert.equal((await api(`beta/campaigns/${id}/meta/dmId`, "PUT", outsiderAuth.localId, p1Auth.idToken)).status, 401);
  assert.equal((await api(`beta/campaigns/${id}/session`, "PUT", { ...badSession, updatedBy: dmAuth.localId }, dmAuth.idToken)).status, 401);
  await p1.locator('[data-tab="calendar"]').click(); assert.equal(await p1.locator("#sessionControls").isVisible(), true);
  await fs.mkdir(path.join(root, "screenshots"), { recursive: true });
  await p1.locator("#notice").evaluate(element => element.hidden = true); await p1.screenshot({ path: path.join(root, "screenshots/calendar.png"), fullPage: true });
  await p1.locator('[data-tab="chat"]').click(); await p1.screenshot({ path: path.join(root, "screenshots/chat.png"), fullPage: true });
  await p1.setViewportSize({ width: 390, height: 844 }); await p1.locator('[data-tab="calendar"]').click();
  assert.equal(await p1.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await p1.screenshot({ path: path.join(root, "screenshots/mobile-calendar.png"), fullPage: true });
  await p1.locator('[data-tab="chat"]').click(); assert.equal(await p1.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log("PASS transferred DM roles, responsive chat/calendar and no browser runtime errors; only local emulators contacted");
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
