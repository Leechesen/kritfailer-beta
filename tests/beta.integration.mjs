import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
const root = path.resolve(import.meta.dirname, ".."), namespace = "demo-kritfailer-beta-default-rtdb";
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
  await context.route("https://www.gstatic.com/firebasejs/10.7.1/*", route => route.fulfill({ path: path.join(root, "node_modules/firebase", new URL(route.request().url()).pathname.split("/").at(-1)), contentType: "text/javascript" }));
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
  console.log("PASS separate persistent email accounts");
  await character(p1, "Hea");
  await dm.locator("#newCampaign").click(); await dm.locator("#newCampaignName").fill("Testovací Kroniky"); await dm.locator("#campaignForm > button").click();
  await dm.locator("#campaignView").waitFor({ state: "visible" });
  await dm.waitForFunction(() => document.querySelector("#inviteCode").value.length === 32);
  const code = await dm.locator("#inviteCode").inputValue();
  await p1.locator("#joinCampaign").click(); await p1.locator("#joinCode").fill(code); await p1.locator("#joinForm > button").click(); await p1.locator("#campaignView").waitFor({ state: "visible" });
  await waitText(dm, "#members", "Hea");
  const admin = (await api("beta/campaigns")).data, id = Object.keys(admin)[0];
  const dmAuth = await loginToken(emails.dm), p1Auth = await loginToken(emails.p1), outsiderAuth = await loginToken(emails.outsider);
  assert.equal((await api(`beta/campaigns/${id}`, "GET", undefined, outsiderAuth.idToken)).status, 401);
  assert.equal((await api(`beta/characters/${p1Auth.localId}`, "GET", undefined, dmAuth.idToken)).status, 401);
  console.log("PASS invitations, own characters and private campaign access");
  await dm.locator('[data-tab="calendar"]').click(); await p1.locator('[data-tab="calendar"]').click();
  await dm.locator('[data-day="14"]').click(); await p1.locator('[data-day="14"]').click();
  await dm.locator("#availabilityStatus").selectOption("yes"); await dm.locator("#availabilityForm > button").click();
  await p1.locator("#availabilityStatus").selectOption("yes"); await p1.locator("#availableFrom").fill("18:00"); await p1.locator("#availabilityForm > button").click();
  await dm.waitForFunction(() => document.querySelector('[data-day="14"]').classList.contains("everyone"));
  assert.ok((await dm.locator('[data-day="14"] .count').textContent()).includes("1/1"));
  assert.equal(await p1.locator("#sessionControls").isVisible(), false);
  const month = await dm.locator("#sessionDate").inputValue();
  const stamp = { ".sv": "timestamp" };
  const badVote = { status: "yes", from: "", until: "", note: "", updatedAt: stamp };
  assert.equal((await api(`beta/campaigns/${id}/availability/${month.slice(0, 7)}/14/${dmAuth.localId}`, "PUT", badVote, p1Auth.idToken)).status, 401);
  const badSession = { date: month, time: "18:00", timezone: "Europe/Prague", note: "", updatedBy: p1Auth.localId, updatedAt: stamp };
  assert.equal((await api(`beta/campaigns/${id}/session`, "PUT", badSession, p1Auth.idToken)).status, 401);
  await dm.locator("#sessionDetails").fill("U herního stolu"); await dm.locator("#sessionForm > button").click();
  await waitText(p1, "#nextSession", "18:00"); await waitText(p1, "#sessionNote", "U herního stolu");
  console.log("PASS availability counts, DM confirmation, live shared session and rejected edits of other players");
  await p1.locator('[data-tab="chat"]').click(); await p1.locator("#message").fill("Ahoj družino <img src=x onerror=alert(1)>"); await p1.locator("#chatForm button").click();
  await dm.locator('[data-tab="chat"]').click(); await waitText(dm, "#messages", "Ahoj družino");
  assert.equal(await dm.locator("#messages img").count(), 0);
  assert.equal((await api(`beta/campaigns/${id}/chat`, "GET", undefined, outsiderAuth.idToken)).status, 401);
  console.log("PASS private live chat and safe message text");
  await p1.reload(); await p1.locator("#campaignView").waitFor({ state: "visible" }); await waitText(p1, "#members", "Hea"); await waitText(p1, "#nextSession", "18:00");
  console.log("PASS account, character, campaign and session survive reload");
  await dm.locator("#play").click(); await dm.locator("#dmPanel").waitFor({ state: "visible" });
  await dm.locator("#severityBtns button").first().click(); await dm.locator("#generator [data-choice]").first().click(); await waitText(dm, "#resHeader", "Náhled pro DM");
  assert.equal((await api(`roomsV2/${id}/overlay`)).data, null);
  await p1.locator("#play").click(); await p1.locator("#playerPanel").waitFor({ state: "visible" }); await p1.locator("#playerGenerator [data-choice]").first().click(); await p1.locator("#playerResult .res-effect").waitFor();
  const published = (await api(`roomsV2/${id}/overlay`)).data; assert.equal(published.player, "Hea");
  console.log("PASS original generator integrated with real account roles, private DM draft and shared player result");
  const viewer = await pageFor(`${origin}/overlay.html?room=${encodeURIComponent(id)}`);
  await viewer.setViewportSize({ width: 3840, height: 2160 });
  await viewer.locator("#overlay-wrap.visible").waitFor(); await waitText(viewer, "#playerName", "Hea");
  const panel = await viewer.locator("#panel").boundingBox();
  assert.equal(panel.width, 3840); assert.equal(panel.height, 2160);
  await dm.locator("#overlaySettings").evaluate(element => element.open = true);
  for (const theme of ["grimoire", "inferno", "astral", "parchment", "nordic", "comic", "ice"]) {
    await dm.locator(`[data-overlay-theme="${theme}"]`).click();
    await viewer.waitForFunction(theme => document.querySelector("#panel").dataset.theme === theme, theme);
  }
  await viewer.waitForFunction(() => !document.querySelector("#overlay-wrap").classList.contains("visible"), null, { timeout: 25000 });
  assert.ok(Date.now() - published.ts >= 19500 && Date.now() - published.ts < 24000);
  console.log("PASS separate TV viewer, full 4K viewport, seven live themes and 20-second overlay expiry");
  await dm.goto(origin); await dm.locator("#campaignView").waitFor({ state: "visible" });
  await dm.locator("#dmSelect").selectOption(p1Auth.localId); await dm.locator("#dmForm > button").click(); await waitText(dm, "#roleLabel", "Hráč");
  await p1.goto(origin); await p1.locator("#campaignView").waitFor({ state: "visible" }); await waitText(p1, "#roleLabel", "Dungeon Master");
  assert.equal((await api(`roomsV2/${id}/dm`)).data, p1Auth.localId);
  assert.equal((await api(`beta/campaigns/${id}/meta/dmId`, "PUT", outsiderAuth.localId, p1Auth.idToken)).status, 401);
  console.log("PASS campaign owner defines DM, with server-enforced roles");
  await p1.setViewportSize({ width: 390, height: 844 }); await p1.locator('[data-tab="calendar"]').click();
  assert.equal(await p1.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await fs.mkdir(path.join(root, "screenshots"), { recursive: true });
  await p1.screenshot({ path: path.join(root, "screenshots/mobile-calendar.png"), fullPage: true });
  await dm.locator('[data-tab="calendar"]').click(); await dm.screenshot({ path: path.join(root, "screenshots/calendar.png"), fullPage: true });
  assert.deepEqual(errors, []);
  console.log("PASS responsive calendar, no browser runtime errors, isolated backend only");
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
