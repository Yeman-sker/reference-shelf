import { App, TFile } from 'obsidian';
import { isImage, localLink } from './source';
import type { ImageSource } from './state';

export interface ReferenceAdapter {
  resolveElement(element: Element, note: string): ImageSource | null;
  resource(source: ImageSource): string | null;
}
const canonical = (url: string): string => {
  try { const parsed = new URL(url); return parsed.origin + decodeURIComponent(parsed.pathname); }
  catch { return url; }
};

/** Vault resources only. SVG is loaded as an image, never injected as markup. */
export class ImageAdapter implements ReferenceAdapter {
  constructor(private readonly app: App) {}
  resolveLink(raw: string, note: string): ImageSource | null {
    const link = localLink(raw);
    if (!link) return null;
    const file = this.app.metadataCache.getFirstLinkpathDest(link, note);
    return file instanceof TFile && isImage(file.path) ? { type: 'image', path: file.path } : null;
  }
  resolveElement(element: Element, note: string): ImageSource | null {
    const image = element.closest('img');
    if (!image) return null;
    const embed = image.closest('.internal-embed');
    const embedded = embed?.getAttribute('src');
    if (embedded) return this.resolveLink(embedded, note);
    const raw = image.getAttribute('src') ?? '';
    const direct = this.resolveLink(raw, note);
    if (direct) return direct;
    // Obsidian rewrites ordinary Markdown image URLs to app:// resource URLs.
    if (!raw.startsWith('app://')) return null;
    const target = canonical(raw);
    const file = this.app.vault.getFiles().find(f => isImage(f.path) && canonical(this.app.vault.getResourcePath(f)) === target);
    return file ? { type: 'image', path: file.path } : null;
  }
  resource(source: ImageSource): string | null {
    const file = this.app.vault.getAbstractFileByPath(source.path);
    return file instanceof TFile && isImage(file.path) ? this.app.vault.getResourcePath(file) : null;
  }
}
