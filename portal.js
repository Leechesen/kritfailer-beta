import { connectPortal, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged, updateProfile, ref, get, set, update, push, onValue, serverTimestamp, query, orderByChild, limitToLast } from "./firebase-client.mjs";
import { safe, text, monthKey, calendarDays, availabilitySummary, sessionLabel, validTimeRange } from "./beta-core.mjs";

const $ = id => document.getElementById(id);
let auth, db, user, profile = {}, characters = {}, campaignId = "", meta = {}, members = {}, session = null, votes = {};
let register = false, pending = false, editCharacterId = "", campaignIds = [], authStops = [], campaignStops = [], monthStop, noticeTimer, voteDirty = false, sessionDirty = false;
let month = new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12), selectedDay = String(new Date().getDate()).padStart(2, "0");
const path = (...parts) => ref(db, ["beta", ...parts].join("/"));
const campaignPath = (...parts) => path("campaigns", campaignId, ...parts);
const displayName = () => profile.name || user?.displayName || user?.email?.split("@")[0]?.slice(0, 30) || "Hráč";
const isOwner = () => meta.ownerId === user?.uid;
const isDM = () => meta.dmId === user?.uid;
const dateKey = () => `${monthKey(month)}-${selectedDay}`;
const statusNames = { yes: "Můžu", maybe: "Možná", no: "Nemůžu", unknown: "Nevyplněno" };
function notify(message, good = false) {
  $("notice").textContent = message; $("notice").hidden = false; $("notice").style.background = good ? "#205c3d" : "#743c12";
  clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $("notice").hidden = true, 7000);
}
function failure(error) {
  console.error(error);
  const descriptions = { "auth/email-already-in-use": "Tento e-mail už má účet. Použij přihlášení.", "auth/invalid-email": "Zkontroluj e-mailovou adresu.", "auth/invalid-login-credentials": "E-mail nebo heslo nesouhlasí.", "auth/invalid-credential": "E-mail nebo heslo nesouhlasí.", "auth/wrong-password": "E-mail nebo heslo nesouhlasí.", "auth/user-not-found": "E-mail nebo heslo nesouhlasí.", "auth/weak-password": "Použij silnější heslo, alespoň 8 znaků.", "auth/network-request-failed": "Připojení se nezdařilo. Ověř běh testovacího Firebase.", "PERMISSION_DENIED": "Akce není povolená. Ověř členství, roli a pravidla testovací databáze." };
  notify(descriptions[error.code] || error.message || "Akce se nepodařila.");
}
async function run(action) {
  if (pending) return;
  pending = true; document.body.setAttribute("aria-busy", "true");
  const buttons = [...document.querySelectorAll("button")]; buttons.forEach(b => b.disabled = true);
  try { await action(); } catch (error) { failure(error); }
  finally { pending = false; document.body.removeAttribute("aria-busy"); buttons.forEach(b => b.disabled = false); }
}
function listen(reference, callback, group) { group.push(onValue(reference, callback, failure)); }
function stopCampaign() { campaignStops.forEach(stop => stop()); campaignStops = []; monthStop?.(); monthStop = null; }
function reset() {
  authStops.forEach(stop => stop()); authStops = []; stopCampaign();
  profile = {}; characters = {}; campaignId = ""; meta = {}; members = {}; votes = {}; session = null; campaignIds = [];
  $("campaignView").hidden = true; $("welcome").hidden = false;
  $("campaignList").replaceChildren(); $("characters").replaceChildren();
  document.querySelectorAll("dialog[open]").forEach(d => d.close());
}
function authMode(signup) {
  register = signup; $("nicknameLabel").hidden = !signup; $("nickname").required = signup;
  $("authSubmit").textContent = signup ? "Založit účet" : "Přihlásit se";
  $("password").autocomplete = signup ? "new-password" : "current-password";
  $("loginTab").className = signup ? "secondary" : "selected"; $("registerTab").className = signup ? "selected" : "secondary";
}
$("loginTab").onclick = () => authMode(false); $("registerTab").onclick = () => authMode(true);
$("authForm").onsubmit = event => { event.preventDefault(); run(async () => {
  const email = $("email").value.trim(), password = $("password").value;
  if (register) {
    const name = text($("nickname").value);
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(result.user, { displayName: name });
    await set(path("profiles", result.user.uid), { name, createdAt: serverTimestamp() });
  } else await signInWithEmailAndPassword(auth, email, password);
  $("password").value = "";
}); };
$("resetPassword").onclick = () => run(async () => {
  const email = $("email").value.trim(); if (!email) throw new Error("Nejprve vyplň e-mail.");
  await sendPasswordResetEmail(auth, email);
  notify("Pokud účet existuje, obdržíš pokyny k obnově hesla. V lokálním testu je odkaz v emulátoru.", true);
});
$("logout").onclick = () => run(() => signOut(auth));
document.querySelectorAll("[data-close]").forEach(button => button.onclick = () => $(button.dataset.close).close());

function renderCharacters() {
  const container = $("characters"); container.replaceChildren();
  for (const [id, character] of Object.entries(characters)) {
    const b = document.createElement("button"); b.className = "character-button";
    b.innerHTML = `${safe(character.name)}<small>${safe(character.className || character.species || "Postava")} · úroveň ${character.level}</small>`;
    b.onclick = () => editCharacter(id); container.append(b);
  }
  if (!Object.keys(characters).length) container.innerHTML = '<p class="empty">Zatím nemáš žádnou postavu.</p>';
  renderCharacterSelects();
}
function renderCharacterSelects() {
  const options = Object.entries(characters).map(([id, c]) => `<option value="${safe(id)}">${safe(c.name)}</option>`).join("");
  $("joinCharacter").innerHTML = options || '<option value="">Nejprve vytvoř postavu</option>';
  const select = $("campaignCharacter"), focused = document.activeElement === select, old = select.value;
  select.innerHTML = '<option value="">Bez postavy (DM)</option>' + options;
  select.value = focused ? old : members[user?.uid]?.characterId || "";
}
function editCharacter(id = "") {
  editCharacterId = id; const c = characters[id] || {};
  $("characterFormTitle").textContent = id ? "Upravit postavu" : "Nová postava";
  $("characterName").value = c.name || ""; $("characterSpecies").value = c.species || ""; $("characterClass").value = c.className || ""; $("characterLevel").value = c.level || 1; $("characterNotes").value = c.notes || "";
  $("characterDialog").showModal();
}
$("newCharacter").onclick = () => editCharacter();
$("characterForm").onsubmit = event => { event.preventDefault(); run(async () => {
  const id = editCharacterId || push(path("characters", user.uid)).key, level = Number($("characterLevel").value);
  if (!Number.isInteger(level) || level < 1 || level > 20) throw new Error("Úroveň musí být od 1 do 20.");
  await set(path("characters", user.uid, id), { name: text($("characterName").value), species: $("characterSpecies").value.trim(), className: $("characterClass").value.trim(), level, notes: $("characterNotes").value.trim(), updatedAt: serverTimestamp() });
  $("characterDialog").close(); notify("Postava byla uložena.", true);
}); };
async function digest(value) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map(v => v.toString(16).padStart(2, "0")).join(""); }
function invitationCode() { return [...crypto.getRandomValues(new Uint8Array(16))].map(v => v.toString(16).padStart(2, "0")).join(""); }
function membership(characterId = "", joinedAt = serverTimestamp(), code = meta.inviteCode) {
  const c = characters[characterId];
  return { name: displayName(), characterId, characterName: c?.name || "", joinedAt, inviteProof: code };
}
async function syncRoomPlayer(id, member, code) {
  const old = (await get(ref(db, `roomsV2/${id}/players/${user.uid}`))).val();
  return { name: member.characterName || member.name, joinedAt: old?.joinedAt || serverTimestamp(), joinProof: await digest(code) };
}
$("newCampaign").onclick = () => $("campaignDialog").showModal();
$("campaignForm").onsubmit = event => { event.preventDefault(); run(async () => {
  const name = text($("newCampaignName").value), id = push(path("campaigns")).key, code = invitationCode(), proof = await digest(code), stamp = serverTimestamp();
  const member = membership("", stamp, code);
  await update(ref(db), {
    [`beta/campaigns/${id}/meta`]: { name, ownerId: user.uid, dmId: user.uid, inviteCode: code, createdAt: stamp },
    [`beta/campaigns/${id}/members/${user.uid}`]: member,
    [`beta/myCampaigns/${user.uid}/${id}`]: true,
    [`beta/invitations/${code}`]: { campaignId: id, name },
    [`roomsV2/${id}`]: { dm: user.uid, name, createdAt: stamp, passwordHash: proof, settings: { severity: "", revision: 0, updatedBy: user.uid, updatedAt: stamp }, players: { [user.uid]: { name: member.name, joinedAt: stamp, joinProof: proof } } },
    [`lobbyV2/${id}`]: { name, dmUid: user.uid, locked: true, createdAt: stamp, playerCount: 1, dmOnline: false },
  });
  $("campaignDialog").close(); $("campaignForm").reset(); await openCampaign(id); notify("Kampaň je připravená. Pozvi družinu kódem v přehledu.", true);
}); };
$("joinCampaign").onclick = () => { renderCharacterSelects(); $("joinDialog").showModal(); };
$("joinForm").onsubmit = event => { event.preventDefault(); run(async () => {
  const code = $("joinCode").value.trim().toLowerCase(), characterId = $("joinCharacter").value;
  if (!characters[characterId]) throw new Error("Nejprve si vytvoř a vyber postavu.");
  if (!/^[0-9a-f]{32}$/.test(code)) throw new Error("Pozvánkový kód není platný.");
  const invitation = (await get(path("invitations", code))).val();
  if (!invitation) throw new Error("Pozvánka neexistuje nebo již není platná.");
  const id = invitation.campaignId;
  const old = (await get(path("campaigns", id, "members", user.uid))).val();
  const member = membership(characterId, old?.joinedAt || serverTimestamp(), code), player = await syncRoomPlayer(id, member, code);
  await update(ref(db), { [`beta/campaigns/${id}/members/${user.uid}`]: member, [`beta/myCampaigns/${user.uid}/${id}`]: true, [`roomsV2/${id}/players/${user.uid}`]: player });
  $("joinDialog").close(); await openCampaign(id); notify("Jsi připojený ke kampani.", true);
}); };
async function renderCampaignList() {
  const currentUser = user?.uid;
  const rows = await Promise.all(campaignIds.map(async id => {
    try { const value = (await get(path("campaigns", id, "meta"))).val(); return value ? { id, ...value } : null; } catch { return null; }
  }));
  if (currentUser !== user?.uid) return;
  const container = $("campaignList"); container.replaceChildren();
  rows.filter(Boolean).forEach(c => { const b = document.createElement("button"); b.className = `campaign-button${c.id === campaignId ? " selected" : ""}`; b.textContent = c.name; b.onclick = () => run(() => openCampaign(c.id)); container.append(b); });
  if (!rows.filter(Boolean).length) container.innerHTML = '<p class="empty">Založ kampaň nebo se připoj pozvánkou.</p>';
}
async function openCampaign(id) {
  const own = (await get(path("campaigns", id, "members", user.uid))).val();
  if (!own) throw new Error("Nejsi členem této kampaně.");
  stopCampaign(); campaignId = id; meta = {}; members = {}; votes = {}; session = null; voteDirty = false; sessionDirty = false;
  localStorage.setItem(`kf_beta_campaign:${user.uid}`, id);
  $("welcome").hidden = true; $("campaignView").hidden = false;
  renderCampaignList();
  listen(campaignPath("meta"), s => { meta = s.val() || {}; renderCampaign(); renderCalendar(); }, campaignStops);
  listen(campaignPath("members"), s => { members = s.val() || {}; renderCampaign(); renderCalendar(); }, campaignStops);
  listen(campaignPath("session"), s => { session = s.val(); renderSession(); renderCalendar(); }, campaignStops);
  listen(query(campaignPath("chat"), orderByChild("ts"), limitToLast(100)), s => renderMessages(s.val() || {}), campaignStops);
  listenMonth();
}
function renderCampaign() {
  $("campaignName").textContent = meta.name || "Načítám kampaň…";
  $("roleLabel").textContent = [isOwner() ? "Správce kampaně" : "", isDM() ? "Dungeon Master" : "Hráč"].filter(Boolean).join(" · ");
  $("ownerControls").hidden = !isOwner(); $("sessionControls").hidden = !isDM();
  $("inviteCode").value = meta.inviteCode || "";
  $("members").innerHTML = Object.entries(members).map(([id, m]) => `<div class="member"><div><strong>${safe(m.name)}</strong><small>${safe(m.characterName || "Bez postavy")}</small></div><span class="role">${id === meta.dmId ? "DM" : "Hráč"}${id === user.uid ? " · ty" : ""}</span></div>`).join("");
  $("dmSelect").innerHTML = Object.entries(members).map(([id, m]) => `<option value="${safe(id)}">${safe(m.name)}</option>`).join(""); $("dmSelect").value = meta.dmId || "";
  renderCharacterSelects(); renderSession();
}
function renderSession() {
  $("nextSession").textContent = sessionLabel(session);
  $("sessionNote").textContent = session?.note || "Dostupnost družiny najdeš v kalendáři.";
}
$("selectCharacterForm").onsubmit = e => { e.preventDefault(); run(async () => {
  const characterId = $("campaignCharacter").value;
  if (!characterId && !isDM()) throw new Error("Vyber svoji postavu.");
  const old = members[user.uid], m = membership(characterId, old.joinedAt), player = await syncRoomPlayer(campaignId, m, meta.inviteCode);
  await update(ref(db), { [`beta/campaigns/${campaignId}/members/${user.uid}`]: m, [`roomsV2/${campaignId}/players/${user.uid}`]: player });
  notify("Postava pro kampaň byla nastavena.", true);
}); };
$("copyInvite").onclick = () => run(async () => { try { await navigator.clipboard.writeText(meta.inviteCode); notify("Pozvánkový kód zkopírován.", true); } catch { $("inviteCode").select(); notify("Kód můžeš zkopírovat z označeného pole."); } });
$("dmForm").onsubmit = e => { e.preventDefault(); run(async () => {
  if (!isOwner()) return;
  const dmId = $("dmSelect").value; if (!members[dmId]) throw new Error("Vyber člena družiny.");
  await update(ref(db), { [`beta/campaigns/${campaignId}/meta/dmId`]: dmId, [`roomsV2/${campaignId}/dm`]: dmId, [`lobbyV2/${campaignId}/dmUid`]: dmId });
  notify("Dungeon Master byl nastaven. Otevřený generátor obnov pro načtení nové role.", true);
}); };
$("play").onclick = () => run(async () => {
  const m = members[user.uid]; if (!m) throw new Error("Nejsi členem kampaně.");
  const player = await syncRoomPlayer(campaignId, m, meta.inviteCode);
  await set(ref(db, `roomsV2/${campaignId}/players/${user.uid}`), player);
  localStorage.setItem(`kf_state_v2:${user.uid}`, JSON.stringify({ room: campaignId, name: player.name, uid: user.uid }));
  location.href = "generator.html";
});
document.querySelectorAll("[data-tab]").forEach(button => button.onclick = () => {
  document.querySelectorAll(".tab-panel").forEach(panel => panel.hidden = panel.id !== button.dataset.tab);
  document.querySelectorAll("[data-tab]").forEach(b => b.className = b === button ? "selected" : "secondary");
  if (button.dataset.tab === "chat") $("messages").scrollTop = $("messages").scrollHeight;
});

function listenMonth() {
  monthStop?.(); votes = {}; voteDirty = false;
  if (!campaignId) return;
  monthStop = onValue(campaignPath("availability", monthKey(month)), snapshot => { votes = snapshot.val() || {}; renderCalendar(); if (!voteDirty) fillVoteForm(); }, failure);
}
function moveMonth(delta) { month = new Date(month.getFullYear(), month.getMonth() + delta, 1, 12); selectedDay = "01"; sessionDirty = false; listenMonth(); }
$("previousMonth").onclick = () => moveMonth(-1); $("nextMonth").onclick = () => moveMonth(1);
function renderCalendar() {
  $("monthTitle").textContent = new Intl.DateTimeFormat("cs-CZ", { month: "long", year: "numeric" }).format(month);
  const container = $("calendarGrid"); container.replaceChildren();
  const days = calendarDays(month.getFullYear(), month.getMonth()), summaries = days.map(d => availabilitySummary(members, meta.dmId, votes[d.day]));
  const best = Math.max(0, ...summaries.filter(s => s.dm === "yes").map(s => s.yes));
  days.forEach((d, index) => {
    const summary = summaries[index], everyone = summary.total > 0 && summary.yes === summary.total && summary.dm === "yes";
    const b = document.createElement("button"); b.type = "button";
    b.className = ["day", selectedDay === d.day ? "selected" : "", votes[d.day]?.[user?.uid]?.status === "yes" ? "mine" : "", everyone ? "everyone" : best > 0 && summary.yes === best && summary.dm === "yes" ? "good" : "", session?.date === `${monthKey(month)}-${d.day}` ? "confirmed" : ""].filter(Boolean).join(" ");
    if (index === 0) b.style.gridColumnStart = d.offset + 1;
    b.dataset.day = d.day; b.setAttribute("aria-pressed", String(d.day === selectedDay));
    b.setAttribute("aria-label", `${d.number}. ${month.getMonth() + 1}.: mohou ${summary.yes} z ${summary.total} hráčů, DM ${statusNames[summary.dm]}`);
    b.innerHTML = `<span class="number">${d.number}</span><span class="count">${summary.yes}/${summary.total}</span><small>DM: ${summary.dm === "yes" ? "ano" : summary.dm === "no" ? "ne" : summary.dm === "maybe" ? "možná" : "?"}</small>`;
    b.onclick = () => { selectedDay = d.day; voteDirty = false; sessionDirty = false; renderCalendar(); fillVoteForm(); };
    container.append(b);
  });
  renderDay();
}
function renderDay() {
  $("selectedDateTitle").textContent = new Intl.DateTimeFormat("cs-CZ", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${dateKey()}T12:00:00Z`));
  if (!sessionDirty) $("sessionDate").value = dateKey();
  $("dayMembers").innerHTML = Object.entries(members).map(([id, m]) => {
    const v = votes[selectedDay]?.[id];
    return `<div class="vote"><strong>${safe(m.name)}${id === meta.dmId ? " · DM" : ""}</strong> — ${statusNames[v?.status || "unknown"]}<small>${safe([v?.from ? `od ${v.from}` : "", v?.until ? `do ${v.until}` : "", v?.note].filter(Boolean).join(" · "))}</small></div>`;
  }).join("");
}
function fillVoteForm() {
  const v = votes[selectedDay]?.[user?.uid] || {};
  $("availabilityStatus").value = v.status || "unknown"; $("availableFrom").value = v.from || ""; $("availableUntil").value = v.until || ""; $("availabilityNote").value = v.note || "";
}
$("availabilityForm").oninput = () => voteDirty = true;
$("availabilityForm").onsubmit = e => { e.preventDefault(); run(async () => {
  const status = $("availabilityStatus").value, from = status === "no" ? "" : $("availableFrom").value, until = status === "no" ? "" : $("availableUntil").value;
  if (!validTimeRange(from, until)) throw new Error("Čas „do“ musí následovat po čase „od“. Pro sezení přes půlnoc doplň poznámku.");
  await set(campaignPath("availability", monthKey(month), selectedDay, user.uid), status === "unknown" ? null : { status, from, until, note: $("availabilityNote").value.trim(), updatedAt: serverTimestamp() });
  voteDirty = false; notify("Dostupnost byla uložena.", true);
}); };
$("sessionForm").oninput = () => sessionDirty = true;
$("sessionForm").onsubmit = e => { e.preventDefault(); run(async () => {
  if (!isDM()) return;
  await set(campaignPath("session"), { date: $("sessionDate").value, time: $("sessionTime").value, timezone: "Europe/Prague", note: $("sessionDetails").value.trim(), updatedBy: user.uid, updatedAt: serverTimestamp() });
  sessionDirty = false; notify("Termín sezení byl potvrzen pro celou družinu.", true);
}); };
function renderMessages(messages) {
  const container = $("messages"), atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 60;
  const rows = Object.entries(messages).sort((a, b) => a[1].ts - b[1].ts || a[0].localeCompare(b[0]));
  container.innerHTML = rows.map(([, m]) => `<article class="message"><div class="byline"><strong>${safe(m.name)}</strong><time>${safe(new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Prague" }).format(new Date(m.ts)))}</time></div><p>${safe(m.body)}</p></article>`).join("") || '<p class="empty">Zatím tu nejsou žádné zprávy.</p>';
  if (atBottom) container.scrollTop = container.scrollHeight;
}
$("chatForm").onsubmit = e => { e.preventDefault(); run(async () => {
  const body = text($("message").value, 2000);
  await set(push(campaignPath("chat")), { uid: user.uid, name: members[user.uid].name, body, ts: serverTimestamp() });
  $("message").value = "";
}); };

try {
  ({ auth, db } = await connectPortal());
  onAuthStateChanged(auth, next => {
    reset(); user = next && !next.isAnonymous ? next : null;
    $("loading").hidden = true; $("authView").hidden = !!user; $("portal").hidden = !user; $("account").hidden = !user;
    if (!user) return;
    $("accountName").textContent = displayName();
    listen(path("profiles", user.uid), s => { profile = s.val() || {}; $("accountName").textContent = displayName(); }, authStops);
    listen(path("characters", user.uid), s => { characters = s.val() || {}; renderCharacters(); }, authStops);
    listen(path("myCampaigns", user.uid), s => {
      campaignIds = Object.keys(s.val() || {}); renderCampaignList();
      const saved = localStorage.getItem(`kf_beta_campaign:${user.uid}`);
      if (!campaignId && saved && campaignIds.includes(saved)) openCampaign(saved).catch(failure);
    }, authStops);
  });
} catch (error) {
  console.error(error);
  $("loading").innerHTML = `<section class="card setup-error"><h1>Testovací prostředí zatím není připojené</h1><p>${safe(error.message)}</p><p class="muted">Postup spuštění je v souboru ZACNI-TADY.md. Běžící generátor používá samostatný projekt.</p></section>`;
}
