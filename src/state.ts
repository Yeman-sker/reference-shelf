export interface ImageSource { type: 'image'; path: string }
export interface TabState { note: string; height: number; collapsed: boolean }
export function clampHeight(value: number, available: number): number {
  const max = Math.max(32, Math.floor(available * 0.7));
  return Math.min(max, Math.max(Math.min(180, max), Number.isFinite(value) ? value : available * 0.32));
}
/** Session-only pins; membership comes from all open leaves, never the active leaf. */
export class ShelfStore {
  readonly pins = new Map<string, ImageSource>();
  readonly tabs = new Map<string, TabState>();
  lastHeight = 0;
  reconcile(open: ReadonlyMap<string, string>): void {
    for (const id of this.tabs.keys()) if (!open.has(id)) this.tabs.delete(id);
    for (const [id, note] of open) {
      if (this.tabs.get(id)?.note !== note) this.tabs.set(id, { note, height: this.lastHeight, collapsed: false });
    }
    const notes = new Set(open.values());
    for (const note of this.pins.keys()) if (!notes.has(note)) this.pins.delete(note);
  }
  pin(note: string, source: ImageSource): void { this.pins.set(note, { ...source }); }
  unpin(note: string): void { this.pins.delete(note); }
  rename(oldPath: string, newPath: string): void {
    const move = (p: string) => p === oldPath ? newPath : p.startsWith(oldPath + '/') ? newPath + p.slice(oldPath.length) : p;
    for (const [note, source] of [...this.pins]) {
      this.pins.delete(note);
      this.pins.set(move(note), { ...source, path: move(source.path) });
    }
    for (const tab of this.tabs.values()) tab.note = move(tab.note);
  }
  clear(): void { this.pins.clear(); this.tabs.clear(); }
}
