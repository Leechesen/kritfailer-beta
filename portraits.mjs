import { safe } from "./beta-core.mjs";
export const PORTRAIT_MAX_CHARS = 90000;
export const PORTRAIT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export function isPortrait(value) {
  return typeof value === "string" && value.length <= PORTRAIT_MAX_CHARS && /^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}
export function portraitMarkup(value, name = "Postava", className = "avatar") {
  if (isPortrait(value)) return `<img class="${safe(className)}" src="${value}" alt="Portrét postavy ${safe(name)}" loading="lazy" decoding="async">`;
  const initials = String(name).trim().split(/\s+/).slice(0, 2).map(word => [...word][0] || "").join("").toLocaleUpperCase("cs-CZ") || "?";
  return `<span class="${safe(className)} avatar-placeholder" aria-hidden="true">${safe(initials)}</span>`;
}
export async function preparePortrait(file) {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Vyber obrázek JPG, PNG nebo WebP.");
  if (file.size > PORTRAIT_UPLOAD_MAX_BYTES) throw new Error("Obrázek může mít nejvýše 10 MB.");
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const header = String.fromCharCode(...bytes);
  const signature = file.type === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : file.type === "image/png" ? [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b) : header.startsWith("RIFF") && header.slice(8, 12) === "WEBP";
  if (!signature) throw new Error("Soubor není platný obrázek JPG, PNG nebo WebP.");
  let image;
  try { image = await createImageBitmap(file); } catch { throw new Error("Obrázek se nepodařilo načíst. Vyber jiný soubor."); }
  try {
    const edge = Math.min(image.width, image.height), sourceX = (image.width - edge) / 2, sourceY = (image.height - edge) / 2;
    for (const size of [...new Set([Math.min(edge, 512), Math.min(edge, 384), Math.min(edge, 256)])]) {
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = size;
      const context = canvas.getContext("2d"); context.fillStyle = "#16213e"; context.fillRect(0, 0, size, size);
      context.drawImage(image, sourceX, sourceY, edge, edge, 0, 0, size, size);
      for (const type of ["image/webp", "image/jpeg"]) for (const quality of [.85, .7, .55]) {
        const portrait = canvas.toDataURL(type, quality);
        if (isPortrait(portrait)) return portrait;
      }
    }
    throw new Error("Obrázek se nepodařilo dostatečně zmenšit. Zkus jiný obrázek.");
  } finally { image.close(); }
}
