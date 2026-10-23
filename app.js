import { connectFirebase, ref, set, get, update, remove, onValue, push, onDisconnect, runTransaction, serverTimestamp, query, orderByChild, limitToLast } from "./firebase-client.mjs";
import { selections, discoverSeverities, chooseResult, singleRoleplay, makeEvent, recentEvents, escapeHtml as esc, validateName } from "./critfail-core.mjs";
import { OVERLAY_THEMES, DEFAULT_OVERLAY_THEME, isOverlayTheme, normalizeOverlayTheme } from "./overlay-themes.mjs";

const ROOMS = "roomsV2", LOBBY = "lobbyV2", STORAGE = "kf_state_v2";
const $ = id => document.getElementById(id);
const palette = ["#2a9d5c", "#e9a020", "#c0392b", "#8e44ad", "#2980b9", "#16a085"];
let db, uid, data = {}, metadata = {}, severities = [], datasetLoading = false;
let state = { room: "", name: "", isDM: false, last: null, busy: false, leaving: false };
let settings = { severity: "", revision: 0 }, players = {}, presence = {}, history = [];
let overlayTheme = DEFAULT_OVERLAY_THEME;
let listeners = [], lobbyListener, connectionRef, connectionCleanup, lobbyCleanup, notifTimer;
let latestResultsTree = {}, lastResultId = null, initialResults = true;
const pendingEvents = new Set();
const dbr = (...parts) => ref(db, parts.join("/"));
const roomRef = (...parts) => dbr(ROOMS, state.room, ...parts);
const sessionKey = () => `${STORAGE}:${uid}`;

function notif(message, color = "#e94560") {
  $("notif").textContent = message;
  $("notif").style.background = color;
  $("notif").classList.add("show");
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => $("notif").classList.remove("show"), 4000);
}
function fail(error) {
  console.error(error);
  const denied = String(error?.code || error?.message).toLowerCase().includes("permission");
  notif(denied ? "Akce nebyla povolena. Ověř připojení do místnosti a nastavení obtížnosti od DM." : (error.message || "Akce se nepodařila."));
}
async function busy(action) {
  if (state.busy || state.leaving) return;
  state.busy = true; renderControls();
  try { return await action(); } catch (error) { fail(error); }
  finally { state.busy = false; renderControls(); }
}
async function digest(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(n => n.toString(16).padStart(2, "0")).join("");
}

async function loadDataset(initial = false) {
  if (datasetLoading) return;
  datasetLoading = true;
  try {
    const versionResponse = await fetch("crit_fails.meta.json", { cache: "no-store" });
    if (!versionResponse.ok) throw new Error("Nepodařilo se načíst data výsledků.");
    const nextMeta = await versionResponse.json();
    if (!nextMeta.version || nextMeta.version === metadata.version) return;
    const response = await fetch(`crit_fails.json?v=${encodeURIComponent(nextMeta.version)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Nepodařilo se načíst výsledky.");
    const contents = await response.text();
    if (await digest(contents) !== nextMeta.version) throw new Error("Aktualizace výsledků ještě probíhá. Zkus to za chvíli.");
    const next = JSON.parse(contents), nextSeverities = discoverSeverities(next);
    if (!nextSeverities.length) throw new Error("Excel neobsahuje žádné dostupné výsledky.");
    data = next; metadata = nextMeta; severities = nextSeverities;
    if (state.room) { buildSeverityButtons(); buildGenerators(); renderControls(); }
    if (!initial) notif("Výsledky byly aktualizovány z Excelu.", "#2a9d5c");
  } finally { datasetLoading = false; }
}

function attributeClass(name) {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  for (const [pattern, css] of [[/strength|sila/, "sila"], [/dexterity|obratnost/, "obratnost"], [/constitution|odolnost/, "odolnost"], [/intelligence|inteligence/, "inteligence"], [/wisdom|moudrost/, "moudrost"], [/charisma/, "charisma"]]) if (pattern.test(normalized)) return `attr-${css}`;
  return "";
}
function buildSeverityButtons() {
  const container = $("severityBtns"); container.replaceChildren();
  severities.forEach((severity, index) => {
    const button = document.createElement("button");
    button.className = "sev-btn"; button.dataset.sev = severity;
    button.textContent = severity; button.style.setProperty("--sev-bg", palette[index % palette.length]);
    button.onclick = () => selectSeverity(severity); container.appendChild(button);
  });
}
function buildGenerators() {
  for (const id of ["generator", "playerGenerator"]) {
    const container = $(id); container.replaceChildren();
    let group, attribute, block, buttons;
    for (const choice of selections(data)) {
      if (group !== choice.group) {
        group = choice.group; attribute = null;
        block = document.createElement("div"); block.className = "cat-block";
        const heading = document.createElement("div"); heading.className = "cat-title";
        heading.textContent = ({ Útok: "⚔️ Útok", Obrana: "🛡️ Obrana", Skilly: "🎯 Skilly" })[group];
        block.appendChild(heading); container.appendChild(block); buttons = null;
      }
      if (choice.attribute && attribute !== choice.attribute) {
        attribute = choice.attribute;
        const label = document.createElement("div"); label.className = `attr-label ${attributeClass(attribute)}`;
        label.textContent = attribute; block.appendChild(label); buttons = null;
      }
      if (!buttons) { buttons = document.createElement("div"); buttons.className = "btn-group"; block.appendChild(buttons); }
      const button = document.createElement("button"); button.className = "btn-secondary btn-sm";
      button.textContent = choice.title; button.dataset.choice = choice.id;
      button.onclick = () => roll(choice.id); buttons.appendChild(button);
    }
  }
}
function renderControls() {
  const ready = !!settings.severity && severities.includes(settings.severity);
  $("sevLabel").textContent = settings.severity || "Vyber obtížnost";
  $("playerRollHint").textContent = ready ? "Vyber, kde ti padl critfail. Výsledek ihned uvidíš ty i DM." : "Čekám, až DM připraví generování.";
  document.querySelectorAll(".sev-btn").forEach(button => {
    button.classList.toggle("active", button.dataset.sev === settings.severity);
    button.disabled = !state.isDM || state.busy;
  });
  const choices = selections(data);
  document.querySelectorAll("[data-choice]").forEach(button => {
    const choice = choices.find(item => item.id === button.dataset.choice);
    const available = !!choice?.severityMap?.[settings.severity]?.length;
    button.disabled = state.busy || !ready || !available || !state.room;
    button.title = !ready ? "Čekám na přípravu generování od DM" : !available ? "Pro tuto volbu nejsou dostupné výsledky" : choice.label;
  });
  if (state.isDM) renderTargets();
  document.querySelectorAll("[data-overlay-theme]").forEach(button => { button.disabled = !state.isDM || state.busy; });
}
function renderOverlayTheme() {
  const selected = OVERLAY_THEMES.find(theme => theme.id === overlayTheme);
  $("overlayThemeLabel").textContent = selected.name;
  document.querySelectorAll("[data-overlay-theme]").forEach(button => {
    const active = button.dataset.overlayTheme === overlayTheme;
    button.classList.toggle("selected", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (state.isDM && $("overlaySettings").open) {
    const url = new URL("overlay.html", location.href);
    url.searchParams.set("preview", "1"); url.searchParams.set("theme", overlayTheme);
    if ($("overlayPreview").getAttribute("src") !== url.href) $("overlayPreview").src = url.href;
  }
}
function buildOverlayThemes() {
  const container = $("overlayThemeOptions"); container.replaceChildren();
  for (const theme of OVERLAY_THEMES) {
    const button = document.createElement("button"); button.type = "button";
    button.className = "overlay-theme-option"; button.dataset.overlayTheme = theme.id;
    const swatch = document.createElement("span"); swatch.className = "overlay-theme-swatch"; swatch.setAttribute("aria-hidden", "true");
    swatch.style.background = theme.surface; swatch.style.borderColor = theme.accent;
    const label = document.createElement("span"); label.textContent = theme.name;
    button.append(swatch, label); button.onclick = () => selectOverlayTheme(theme.id);
    container.appendChild(button);
  }
  $("overlaySettings").ontoggle = renderOverlayTheme;
  renderOverlayTheme();
}
async function selectOverlayTheme(theme) {
  if (!state.isDM || !isOverlayTheme(theme) || theme === overlayTheme) return;
  await busy(async () => {
    await set(roomRef("overlayConfig"), { theme });
    notif("Vzhled overlaye byl uložen pro celou místnost.", "#2a9d5c");
  });
}
async function selectSeverity(severity) {
  if (!state.isDM || !severities.includes(severity)) return;
  await busy(async () => {
    const transaction = await runTransaction(roomRef("settings"), current => ({ severity, revision: (current?.revision || 0) + 1, updatedBy: uid, updatedAt: serverTimestamp() }));
    if (!transaction.committed) throw new Error("Nastavení obtížnosti se nepodařilo uložit.");
    notif(`Obtížnost pro místnost: ${severity}`, "#2a9d5c");
  });
}
async function publish(result, targetId = uid, targetName = state.name, kind = "roll") {
  const key = push(roomRef("results", targetId)).key;
  const event = makeEvent({ result, actorId: uid, actorName: state.name, targetId, targetName, datasetVersion: metadata.version, kind, ts: serverTimestamp() });
  const publishingRoom = state.room;
  pendingEvents.add(key);
  try {
    await update(ref(db), {
      [`${ROOMS}/${publishingRoom}/results/${targetId}/${key}`]: event,
      [`${ROOMS}/${publishingRoom}/overlay`]: { ...event, id: key, title: result.label, player: targetName },
    });
    pendingEvents.delete(key);
    if (state.room === publishingRoom && !state.leaving) receiveResults(latestResultsTree);
  } catch (error) { pendingEvents.delete(key); throw error; }
  return { ...event, id: key };
}
async function roll(selectionId) {
  await busy(async () => {
    // Read the latest DM settings; database rules reject a changed revision at commit time.
    const snapshot = await get(roomRef("settings"));
    settings = snapshot.val() || {};
    const result = chooseResult(data, selectionId, settings);
    if (state.isDM) {
      showEvent({ ...result, targetName: state.name, kind: "draft" });
      notif("Náhled je připravený. Vyber hráče pro odeslání.", "#2a9d5c");
    } else {
      await publish(result);
      notif("Výsledek byl uložen a zobrazen DM.", "#2a9d5c");
    }
  });
}
function resultMarkup(event) {
  return `<div class="res-effect">⚠️ ${esc(event.effect)}</div>${singleRoleplay(event.roleplay).map(rp => `<div class="res-rp"><div class="rp-label">🎭 Roleplay</div><div class="preserve-lines">${esc(rp)}</div></div>`).join("")}`;
}
function showEvent(event) {
  state.last = event;
  const label = `${event.targetName} · ${event.label}${state.isDM ? ` / ${event.severity}` : ""}`;
  if (state.isDM) {
    $("resultBox").classList.remove("hidden"); $("resHeader").textContent = `${event.kind === "draft" ? "👁️ Náhled pro DM:" : "🎲"} ${label}`;
    $("resBody").innerHTML = resultMarkup(event); renderTargets();
  } else {
    $("playerResult").innerHTML = `<div class="result-context">${esc(label)}</div>${resultMarkup(event)}`;
    $("playerResult").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}
function receiveResults(tree) {
  latestResultsTree = tree || {};
  history = recentEvents(latestResultsTree).filter(event => !pendingEvents.has(event.id));
  renderHistory();
  const currentId = history[0] ? `${history[0].targetId}/${history[0].id}` : null;
  if (history[0] && currentId !== lastResultId) {
    // A player's new roll must not replace the DM's unsent preview.
    if (!state.isDM || state.last?.kind !== "draft") showEvent(history[0]);
    if (!initialResults) notif(state.isDM ? `🎲 Nový výsledek: ${history[0].targetName}` : "🎲 Nový výsledek", "#2a9d5c");
    lastResultId = currentId;
  }
  initialResults = false;
}
function renderHistory() {
  const container = $(state.isDM ? "dmHistory" : "playerHistory"); container.replaceChildren();
  history.slice(0, 15).forEach(event => {
    const button = document.createElement("button"); button.className = "btn-secondary history-item";
    button.textContent = `${event.targetName} · ${event.label}${state.isDM ? ` · ${event.severity}` : ""}`;
    button.onclick = () => showEvent(event); container.appendChild(button);
  });
}
function renderTargets() {
  const container = $("targets"); container.replaceChildren();
  const targets = Object.entries(players).filter(([id]) => id !== uid);
  if (!targets.length) { container.innerHTML = '<div class="empty-note">Žádní hráči k dispozici</div>'; return; }
  for (const [id, player] of targets) {
    const row = document.createElement("div"); row.className = "target-row";
    const label = document.createElement("div"); label.className = "target-name"; label.textContent = `🧑 ${player.name}`; row.appendChild(label);
    const buttons = document.createElement("div"); buttons.className = "target-btns";
    const button = document.createElement("button"); button.className = "btn-success btn-sm"; button.textContent = "📨 Poslat výsledek";
    button.disabled = !state.last || state.busy;
    button.onclick = () => sendToPlayer(id); buttons.appendChild(button);
    row.appendChild(buttons); container.appendChild(row);
  }
}
async function sendToPlayer(targetId) {
  if (!state.isDM || !state.last || !players[targetId]) return;
  const result = { entryId: state.last.entryId, label: state.last.label, severity: state.last.severity, settingsRevision: state.last.settingsRevision, effect: state.last.effect, roleplay: singleRoleplay(state.last.roleplay) };
  await busy(async () => {
    const event = await publish(result, targetId, players[targetId].name, "assignment");
    showEvent(event);
    notif("Výsledek byl odeslán hráči.", "#2a9d5c");
  });
}

function saveSession() { localStorage.setItem(sessionKey(), JSON.stringify({ room: state.room, name: state.name, uid })); }
function clearListeners() { listeners.forEach(stop => stop()); listeners = []; if (lobbyListener) { lobbyListener(); lobbyListener = null; } }
async function releasePresence() {
  try { if (connectionCleanup) await connectionCleanup.cancel(); if (lobbyCleanup) await lobbyCleanup.cancel(); if (connectionRef) await remove(connectionRef); }
  catch (error) { console.warn("Presence cleanup", error); }
  connectionRef = connectionCleanup = lobbyCleanup = null;
}
async function leave(message = "") {
  state.leaving = true; clearListeners(); await releasePresence();
  if (state.isDM && state.room) await update(dbr(LOBBY, state.room), { dmOnline: false }).catch(() => {});
  localStorage.removeItem(sessionKey()); state = { room: "", name: state.name, isDM: false, last: null, busy: false, leaving: false };
  settings = { severity: "", revision: 0 }; players = {}; presence = {}; history = [];
  overlayTheme = DEFAULT_OVERLAY_THEME; $("overlayPreview").removeAttribute("src");
  showSetup(); if (message) notif(message);
}
function showSetup() {
  $("loading").classList.add("hidden"); $("app").classList.add("hidden"); $("setup").classList.remove("hidden");
  $("topBtns").replaceChildren(); $("playersTop").textContent = ""; $("nameInput").value = state.name || "";
  if (lobbyListener) lobbyListener();
  lobbyListener = onValue(dbr(LOBBY), snapshot => renderLobby(snapshot.val() || {}), fail);
}
function renderLobby(rooms) {
  const container = $("lobbyList"); container.replaceChildren();
  if (!Object.keys(rooms).length) { container.innerHTML = '<div class="empty-note" style="text-align:center;padding:16px;">Žádné místnosti…</div>'; return; }
  for (const [id, room] of Object.entries(rooms)) {
    const row = document.createElement("div"); row.className = "room-item";
    const details = document.createElement("div");
    const title = document.createElement("div"); title.className = "room-name"; title.textContent = `🚪 ${room.name}`; details.appendChild(title);
    const meta = document.createElement("div"); meta.className = "room-meta"; meta.textContent = `👥 ${room.playerCount || 0} · 👑 DM ${room.dmOnline ? "online" : "offline"}`; details.appendChild(meta);
    if (room.locked) { const lock = document.createElement("div"); lock.className = "room-locked"; lock.textContent = "🔒 Vyžaduje heslo"; details.appendChild(lock); }
    const button = document.createElement("button"); button.className = `${room.dmUid === uid ? "btn-dm" : "btn-secondary"} btn-sm`;
    button.textContent = room.dmUid === uid ? "👑 Vstoupit jako DM" : "Připojit"; button.onclick = () => joinRoom(id, room);
    row.append(details, button); container.appendChild(row);
  }
}
async function createRoom() {
  await busy(async () => {
    const name = validateName($("nameInput").value), roomName = validateName($("roomInput").value, "Název místnosti");
    const password = $("passwordInput").value;
    const room = push(dbr(ROOMS)).key, proof = password ? await digest(password) : "";
    const timestamp = serverTimestamp();
    await update(ref(db), {
      [`${ROOMS}/${room}`]: { dm: uid, name: roomName, createdAt: timestamp, passwordHash: proof, settings: { severity: "", revision: 0, updatedBy: uid, updatedAt: timestamp }, players: { [uid]: { name, joinedAt: timestamp, joinProof: proof } } },
      [`${LOBBY}/${room}`]: { name: roomName, dmUid: uid, locked: !!password, createdAt: timestamp, playerCount: 1, dmOnline: true },
    });
    await enterRoom(room, name, roomName, uid);
  });
}
async function joinRoom(room, listing) {
  await busy(async () => {
    const name = validateName($("nameInput").value);
    const existing = await get(dbr(ROOMS, room, "players", uid));
    let proof = existing.val()?.joinProof || "";
    if (!existing.exists() && listing.locked && listing.dmUid !== uid) {
      const password = window.prompt(`🔒 Místnost „${listing.name}" vyžaduje heslo:`);
      if (password === null) return;
      proof = await digest(password);
    }
    await set(dbr(ROOMS, room, "players", uid), { name, joinedAt: existing.val()?.joinedAt || serverTimestamp(), joinProof: proof });
    await enterRoom(room, name, listing.name, listing.dmUid);
  });
}
async function enterRoom(room, name, roomName, owner) {
  clearListeners(); await releasePresence();
  state = { room, name, roomName, ownerId: owner, isDM: owner === uid, last: null, busy: false, leaving: false };
  settings = { severity: "", revision: 0 }; players = {}; presence = {}; history = []; saveSession();
  overlayTheme = DEFAULT_OVERLAY_THEME; $("overlaySettings").open = false; $("overlayPreview").removeAttribute("src");
  latestResultsTree = {}; lastResultId = null; initialResults = true; pendingEvents.clear();
  $("setup").classList.add("hidden"); $("loading").classList.add("hidden"); $("app").classList.remove("hidden");
  $("roomTitle").textContent = `${state.isDM ? "👑" : "🧑"} Místnost: ${roomName}`;
  $("dmPanel").classList.toggle("hidden", !state.isDM); $("playerPanel").classList.toggle("hidden", state.isDM);
  $("resultBox").classList.add("hidden"); $("playerResult").innerHTML = '<div class="waiting-text">Vyber typ critfailu a vygeneruj výsledek.</div>';
  $("topBtns").replaceChildren();
  const logout = document.createElement("button"); logout.className = "btn-secondary btn-sm"; logout.textContent = "🚪 Odejít"; logout.onclick = () => leave(); $("topBtns").appendChild(logout);
  if (state.isDM) {
    buildOverlayThemes();
    const overlay = document.createElement("button"); overlay.className = "btn-secondary btn-sm"; overlay.textContent = "📺 Overlay";
    overlay.onclick = async () => { const url = new URL(`overlay.html?room=${encodeURIComponent(state.room)}`, location.href).href; try { await navigator.clipboard.writeText(url); notif("Odkaz na overlay byl zkopírován.", "#2a9d5c"); } catch { window.prompt("Odkaz na overlay:", url); } }; $("topBtns").appendChild(overlay);

  }
  buildSeverityButtons(); buildGenerators(); renderControls();
  const listen = (reference, callback) => listeners.push(onValue(reference, callback, error => { if (!state.leaving) fail(error); }));
  listen(roomRef("players", uid), snapshot => { if (!snapshot.exists() && !state.leaving) leave("Byl/a jsi vyřazen/a z místnosti, nebo byla místnost smazána."); });
  listen(roomRef("settings"), snapshot => { settings = snapshot.val() || {}; renderControls(); });
  if (state.isDM) listen(roomRef("overlayConfig"), snapshot => { overlayTheme = normalizeOverlayTheme(snapshot.val()?.theme); renderOverlayTheme(); });
  listen(roomRef("players"), snapshot => { players = snapshot.val() || {}; renderPlayers(); renderTargets(); });
  listen(roomRef("presence"), snapshot => { presence = snapshot.val() || {}; renderPlayers(); });
  const resultsRef = state.isDM ? roomRef("results") : query(roomRef("results", uid), orderByChild("ts"), limitToLast(30));
  listen(resultsRef, snapshot => {
    const tree = state.isDM ? snapshot.val() : { [uid]: snapshot.val() };
    receiveResults(tree);
  });
  listen(dbr(".info", "connected"), snapshot => { if (snapshot.val() === true) connectPresence().catch(fail); });
}
async function connectPresence() {
  if (!state.room || state.leaving) return;
  const room = state.room;
  const member = await get(roomRef("players", uid));
  if (!member.exists() || room !== state.room || state.leaving) return;
  await releasePresence();
  connectionRef = push(roomRef("presence", uid));
  connectionCleanup = onDisconnect(connectionRef); await connectionCleanup.remove();
  if (state.isDM) { lobbyCleanup = onDisconnect(dbr(LOBBY, state.room, "dmOnline")); await lobbyCleanup.set(false); }
  await set(connectionRef, true);
}
function renderPlayers() {
  const online = id => Object.keys(presence[id] || {}).length > 0;
  $("playersTop").textContent = Object.entries(players).map(([id, p]) => `${id === state.ownerId ? "👑 " : ""}${p.name}${online(id) ? "" : " (offline)"}`).join("  |  ");
  const container = $(state.isDM ? "dmPlayerList" : "playerListPlayer"); container.replaceChildren();
  for (const [id, player] of Object.entries(players)) {
    const chip = document.createElement("div"); chip.className = "player-chip";
    const name = document.createElement("span"); name.className = "player-chip-name";
    name.textContent = `${id === state.ownerId ? "👑" : "🧑"} ${player.name}${online(id) ? "" : " (offline)"}`; chip.appendChild(name);
    if (state.isDM && id !== uid) { const kick = document.createElement("button"); kick.className = "btn-kick btn-sm"; kick.textContent = "❌ Kick"; kick.onclick = () => kickPlayer(id, player.name); chip.appendChild(kick); }
    container.appendChild(chip);
  }
  if (state.isDM && state.room && !state.leaving) update(dbr(LOBBY, state.room), { playerCount: Object.keys(players).length, dmOnline: online(uid) }).catch(console.error);
}
async function kickPlayer(playerId, name) {
  if (!state.isDM || !confirm(`Vyřadit hráče „${name}" z této místnosti?`)) return;
  await busy(() => update(ref(db), { [`${ROOMS}/${state.room}/banned/${playerId}`]: true, [`${ROOMS}/${state.room}/players/${playerId}`]: null, [`${ROOMS}/${state.room}/presence/${playerId}`]: null }));
}
async function deleteRoom() {
  if (!state.isDM || !confirm("Opravdu smazat místnost a její výsledky?")) return;
  await busy(async () => { const room = state.room; await update(ref(db), { [`${ROOMS}/${room}`]: null, [`${LOBBY}/${room}`]: null }); await leave("Místnost byla smazána."); });
}
async function init() {
  await loadDataset(true);
  ({ db, uid } = await connectFirebase());
  let saved; try { saved = JSON.parse(localStorage.getItem(sessionKey()) || "null"); } catch { localStorage.removeItem(sessionKey()); }
  if (saved?.room && saved.uid === uid) {
    try {
      const [listing, member] = await Promise.all([get(dbr(LOBBY, saved.room)), get(dbr(ROOMS, saved.room, "players", uid))]);
      if (listing.exists() && member.exists()) await enterRoom(saved.room, member.val().name, listing.val().name, listing.val().dmUid);
      else { localStorage.removeItem(sessionKey()); showSetup(); }
    } catch (error) { console.warn("Obnovení místnosti se nepodařilo.", error); localStorage.removeItem(sessionKey()); showSetup(); }
  } else showSetup();
  setInterval(() => loadDataset().catch(console.warn), 60_000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadDataset().catch(console.warn); });
}

window.toggleCreate = () => $("createRoomSection").classList.toggle("hidden");
window.createRoom = createRoom;
init().catch(error => { console.error(error); $("loading").innerHTML = `<div style="color:#e94560">${esc(error.message || "Aplikaci se nepodařilo načíst.")}</div>`; });
