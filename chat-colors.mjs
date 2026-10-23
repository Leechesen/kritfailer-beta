export const CHAT_PALETTE = ["#9BD5FF", "#FFB5BE", "#B8E6A2", "#E1C2FF", "#FFD88F", "#8DE1D2", "#F5B0E4", "#CDD39C", "#AEBBFF", "#FFB895", "#A5E5F4", "#DDE89D"];
export const normalizeColor = value => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : null;
const hex = rgb => "#" + rgb.map(c => Math.round(c).toString(16).padStart(2, "0")).join("").toUpperCase();
const luminance = rgb => rgb.map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((s, c, i) => s + c * [.2126, .7152, .0722][i], 0);
export function readableColor(value) {
  const color = normalizeColor(value) || CHAT_PALETTE[0], rgb = color.slice(1).match(/../g).map(c => parseInt(c, 16));
  const background = luminance([16, 28, 53]);
  for (let step = 0; step <= 25; step++) {
    const mixed = rgb.map(c => c + (255 - c) * step / 25);
    if ((luminance(mixed) + .05) / (background + .05) >= 4.5) return hex(mixed);
  }
  return "#FFFFFF";
}
function hash(value) { let result = 2166136261; for (const char of value) result = Math.imul(result ^ char.codePointAt(0), 16777619); return result >>> 0; }
function automaticColor(key, used = new Set()) {
  const start = hash(key) % CHAT_PALETTE.length;
  for (let i = 0; i < CHAT_PALETTE.length; i++) { const color = CHAT_PALETTE[(start + i) % CHAT_PALETTE.length]; if (!used.has(color)) return color; }
  for (let i = 0; i < 1000; i++) {
    const value = hash(`${key}:${i}`), color = readableColor(hex([128 + (value & 127), 128 + ((value >>> 8) & 127), 128 + ((value >>> 16) & 127)]));
    if (!used.has(color)) return color;
  }
  return CHAT_PALETTE[start];
}
const identityKey = (uid, characterId) => `${uid}:${characterId || "player"}`;
export function speakerColors(members = {}) {
  const result = {}, used = new Set();
  for (const [uid, member] of Object.entries(members)) if (normalizeColor(member.chatColor)) { result[uid] = readableColor(member.chatColor); used.add(result[uid]); }
  for (const [uid, member] of Object.entries(members).sort(([a, ma], [b, mb]) => identityKey(a, ma.characterId).localeCompare(identityKey(b, mb.characterId)))) if (!result[uid]) {
    result[uid] = automaticColor(identityKey(uid, member.characterId), used); used.add(result[uid]);
  }
  return result;
}
export function messageSpeaker(message, members = {}, colors = speakerColors(members), dmId = "") {
  const member = members[message.uid] || {}, snapshot = typeof message.characterId === "string";
  const characterId = snapshot ? message.characterId : member.characterId || "";
  const sameCharacter = !snapshot || characterId === (member.characterId || "");
  return {
    name: message.name || member.name || "Hráč", characterId,
    characterName: (snapshot ? message.characterName : member.characterName) || (message.uid === dmId ? "Dungeon Master" : "Bez postavy"),
    portrait: sameCharacter ? member.characterPortrait : "",
    color: sameCharacter && colors[message.uid] ? colors[message.uid] : normalizeColor(message.chatColor) ? readableColor(message.chatColor) : automaticColor(identityKey(message.uid, characterId)),
  };
}
