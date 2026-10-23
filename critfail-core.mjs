export const PREFERRED_SEVERITIES = ["Lehký", "Střední", "Těžký", "Sranda"];

export function selections(data) {
  const result = [];
  for (const [type, severityMap] of Object.entries(data["Útok"] || {})) result.push({ id: `attack:${type}`, group: "Útok", label: `Útok – ${type}`, title: type, severityMap });
  if (data["Obrana"]) result.push({ id: "defence", group: "Obrana", label: "Obrana", title: "Obrana", severityMap: data["Obrana"] });
  for (const [attribute, skills] of Object.entries(data.Skill || {})) {
    for (const [skill, severityMap] of Object.entries(skills)) result.push({ id: `skill:${attribute}:${skill}`, group: "Skilly", attribute, label: `${attribute} – ${skill}`, title: skill, severityMap });
  }
  return result;
}

export function discoverSeverities(data) {
  const found = new Set();
  for (const choice of selections(data)) for (const [severity, pool] of Object.entries(choice.severityMap || {})) if (Array.isArray(pool) && pool.length) found.add(severity);
  return [...PREFERRED_SEVERITIES.filter(s => found.has(s)), ...[...found].filter(s => !PREFERRED_SEVERITIES.includes(s))];
}

export function weightedChoice(pool, random = Math.random) {
  if (!Array.isArray(pool) || !pool.length) throw new Error("Pro tuto kombinaci nejsou výsledky.");
  const weights = pool.map(item => item.weight ?? 1);
  if (weights.some(w => typeof w !== "number" || !Number.isFinite(w) || w <= 0)) throw new Error("Neplatná váha výsledku.");
  const total = weights.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(total)) throw new Error("Součet vah je příliš velký.");
  let remaining = Math.max(0, Math.min(1 - Number.EPSILON, random())) * total;
  for (let index = 0; index < pool.length; index++) { remaining -= weights[index]; if (remaining < 0) return pool[index]; }
  return pool.at(-1);
}

export function chooseResult(data, selectionId, settings, random = Math.random) {
  if (!settings?.severity || !Number.isInteger(settings.revision) || settings.revision < 1) throw new Error("Nejprve musí DM nastavit obtížnost.");
  const choice = selections(data).find(item => item.id === selectionId);
  if (!choice) throw new Error("Tento typ critfailu už není v datech.");
  const pool = choice.severityMap[settings.severity];
  const entry = weightedChoice(pool, random);
  return { entryId: `${selectionId}|${settings.severity}|${pool.indexOf(entry)}`, label: choice.label, severity: settings.severity, settingsRevision: settings.revision, effect: String(entry.effect || ""), roleplay: singleRoleplay(entry.roleplay) };
}

export function singleRoleplay(values) {
  return (Array.isArray(values) ? values : []).filter(value => typeof value === "string" && value.trim()).slice(0, 1);
}

export function makeEvent({ result, actorId, actorName, targetId = actorId, targetName = actorName, datasetVersion, kind = "roll", ts }) {
  if (!actorId || !targetId || !result?.effect || !result?.severity) throw new Error("Výsledek není kompletní.");
  if (kind !== "roll" && kind !== "assignment") throw new Error("Neplatný typ výsledku.");
  return { ...result, roleplay: singleRoleplay(result.roleplay), actorId, actorName, targetId, targetName, datasetVersion, kind, clientTs: Date.now(), ts };
}

export function recentEvents(tree, limit = 30) {
  const events = [];
  for (const [targetId, records] of Object.entries(tree || {})) for (const [id, event] of Object.entries(records || {})) if (event && typeof event === "object" && typeof event.effect === "string") events.push({ ...event, targetId, id });
  return events.sort((a, b) => (b.ts || b.clientTs || 0) - (a.ts || a.clientTs || 0) || b.id.localeCompare(a.id)).slice(0, limit);
}

export function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }

export function validateName(value, label = "Jméno") {
  const name = String(value || "").trim();
  if (!name || name.length > 30) throw new Error(`${label} musí mít 1 až 30 znaků.`);
  return name;
}
