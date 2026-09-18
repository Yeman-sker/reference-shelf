export const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'svg']);
export function isImage(path: string): boolean {
  return IMAGE_EXTENSIONS.has(path.split('.').pop()?.toLowerCase() ?? '');
}
/** Refuse remote URLs, data URLs and non-image embeds before consulting the vault. */
export function localLink(raw: string): string | null {
  let value = raw.trim();
  if (value.startsWith('![[') && value.endsWith(']]')) value = value.slice(3, -2);
  value = value.split('|')[0]?.trim() ?? '';
  if (value.startsWith('<') && value.endsWith('>')) value = value.slice(1, -1);
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return null;
  try { value = decodeURIComponent(value); } catch { return null; }
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return null;
  value = value.split('#')[0] ?? '';
  return value && isImage(value) ? value : null;
}
