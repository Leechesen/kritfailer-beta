export const PRODUCTION_PROJECT = "ktit-fail-generator";
export function validateBetaConfig(config, hostname) {
  if (config?.environment !== "beta" || !["emulator", "online"].includes(config.mode)) throw new Error("Chybí konfigurace testovací verze.");
  if (JSON.stringify(config).includes(PRODUCTION_PROJECT)) throw new Error("Beta se nesmí připojit k ostrému projektu.");
  const id = config.firebase?.projectId;
  if (!id || id !== config.expectedProjectId) throw new Error("Nastav samostatný testovací Firebase projekt se stejným ID v expectedProjectId a firebase.projectId.");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  if (config.mode === "emulator" && (!local || !id.startsWith("demo-"))) throw new Error("Lokální beta se spouští na http://localhost:5000. Pro online betu nejprve nastav vlastní testovací projekt.");
  if (config.mode === "online") {
    if (id.startsWith("demo-") || !config.firebase.apiKey || !config.firebase.databaseURL) throw new Error("Doplň konfiguraci nového testovacího projektu.");
    for (const value of [config.firebase.authDomain, config.firebase.databaseURL]) {
      let url; try { url = new URL(value.includes("://") ? value : `https://${value}`); } catch { throw new Error("Neplatná adresa testovacího Firebase."); }
      if (url.protocol !== "https:" || ![`${id}.firebaseapp.com`, `${id}.firebaseio.com`, `${id}-default-rtdb.firebaseio.com`, `${id}-default-rtdb.europe-west1.firebasedatabase.app`, `${id}-default-rtdb.asia-southeast1.firebasedatabase.app`, `${id}-default-rtdb.us-central1.firebasedatabase.app`].includes(url.hostname)) throw new Error("Adresa databáze nepatří k vybranému testovacímu projektu.");
    }
  }
  return config;
}
export function monthKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }
export function calendarDays(year, month) {
  const first = new Date(year, month, 1, 12), offset = (first.getDay() + 6) % 7;
  return Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, i) => ({ day: String(i + 1).padStart(2, "0"), number: i + 1, offset: i === 0 ? offset : 0 }));
}
export function availabilitySummary(members, dmId, votes = {}) {
  const ids = Object.keys(members || {}).filter(id => id !== dmId);
  return { total: ids.length, yes: ids.filter(id => votes[id]?.status === "yes").length, maybe: ids.filter(id => votes[id]?.status === "maybe").length, answered: ids.filter(id => votes[id]).length, dm: votes[dmId]?.status || "unknown" };
}
export function sessionCandidates(members, dmId, availability, fromDate, order = "date") {
  const result = [];
  for (const [month, days] of Object.entries(availability || {})) {
    for (const [day, votes] of Object.entries(days || {})) {
      const date = `${month}-${day}`;
      if (!/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date) || date < fromDate) continue;
      const parsed = new Date(`${date}T12:00:00Z`);
      if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) continue;
      const summary = availabilitySummary(members, dmId, votes);
      if (summary.yes > 0 || summary.dm === "yes") result.push({ date, ...summary, votes });
    }
  }
  return result.sort((a, b) => (order === "players" ? b.yes - a.yes : 0) || a.date.localeCompare(b.date));
}
export function sessionLabel(session) {
  if (!session?.date || !session?.time) return "Termín zatím není potvrzený";
  const date = new Date(`${session.date}T12:00:00Z`);
  return `${new Intl.DateTimeFormat("cs-CZ", { dateStyle: "full", timeZone: "UTC" }).format(date)} v ${session.time}`;
}
export const safe = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function text(value, max = 30) {
  const s = String(value || "").trim();
  if (!s || s.length > max) throw new Error(`Vyplň text o délce 1 až ${max} znaků.`);
  return s;
}
export function validTimeRange(from, until) { return (!from || /^([01]\d|2[0-3]):[0-5]\d$/.test(from)) && (!until || /^([01]\d|2[0-3]):[0-5]\d$/.test(until)) && (!from || !until || from < until); }
