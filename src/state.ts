export interface ImageSource { type: 'image'; path: string }
export interface Crop { x: number; y: number; w: number; h: number }
export interface Pin {
  id: string; note: string; source: ImageSource; crop: Crop;
  imageWidth: number; imageHeight: number; global: boolean;
}
export interface Placement { x: number; y: number; width: number; collapsed: boolean; z: number; maxHeight?: number }
export interface Bounds { width: number; height: number }
export interface TabState { note: string; placements: Map<string, Placement> }
export const FULL_CROP: Readonly<Crop> = { x: 0, y: 0, w: 1, h: 1 };
export const HEADER_HEIGHT = 28;
const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export function validCrop(crop: Crop): Crop {
  const x = clamp(finite(crop.x, 0), 0, 0.99), y = clamp(finite(crop.y, 0), 0, 0.99);
  return { x, y, w: clamp(finite(crop.w, 1), 0.01, 1 - x), h: clamp(finite(crop.h, 1), 0.01, 1 - y) };
}
export function pinRatio(pin: Pin): number {
  return (pin.imageWidth * pin.crop.w) / (pin.imageHeight * pin.crop.h);
}
export function placementHeight(placement: Placement, pin: Pin): number {
  return placement.collapsed ? HEADER_HEIGHT : Math.min(placement.maxHeight ?? Infinity, HEADER_HEIGHT + placement.width / pinRatio(pin));
}
/** Clamp only to the window, never to a leaf or a text column. */
export function fitPlacement(placement: Placement, pin: Pin, bounds: Bounds): Placement {
  // A very narrow crop must not shrink its toolbar out of reach. Letterbox it instead.
  const maxWidth = Math.max(Math.min(160, bounds.width), Math.min(bounds.width, Math.max(1, bounds.height - HEADER_HEIGHT) * pinRatio(pin)));
  const width = clamp(finite(placement.width, 280), Math.min(160, maxWidth), maxWidth);
  const maxHeight = Math.max(HEADER_HEIGHT, bounds.height);
  const height = placementHeight({ ...placement, width, maxHeight }, pin);
  return { ...placement, width, maxHeight, x: clamp(finite(placement.x, 12), 0, Math.max(0, bounds.width - width)),
    y: clamp(finite(placement.y, 12), 0, Math.max(0, bounds.height - height)) };
}
/** Session-only note references; geometry is independent per tab (or window for global pins). */
export class ShelfStore {
  readonly pins = new Map<string, Pin>();
  readonly tabs = new Map<string, TabState>();
  readonly globalPlacements = new Map<string, Map<string, Placement>>();
  private serial = 0;
  private z = 0;
  reconcile(open: ReadonlyMap<string, string>): void {
    for (const id of this.tabs.keys()) if (!open.has(id)) this.tabs.delete(id);
    for (const [id, note] of open) if (this.tabs.get(id)?.note !== note) this.tabs.set(id, { note, placements: new Map() });
    const notes = new Set(open.values());
    for (const [id, pin] of this.pins) if (!pin.global && !notes.has(pin.note)) this.remove(id);
  }
  add(note: string, source: ImageSource, width = 800, height = 500, crop: Crop = FULL_CROP): Pin {
    const pin: Pin = { id: `pin-${++this.serial}`, note, source: { ...source }, crop: validCrop(crop),
      imageWidth: Math.max(1, finite(width, 800)), imageHeight: Math.max(1, finite(height, 500)), global: false };
    this.pins.set(pin.id, pin); return pin;
  }
  visible(note: string | null): Pin[] { return [...this.pins.values()].filter(pin => pin.global || pin.note === note); }
  layout(pin: Pin, tabId: string | null, windowId: string, initial: Placement): Placement {
    let layouts: Map<string, Placement> | undefined;
    if (pin.global) {
      layouts = this.globalPlacements.get(windowId);
      if (!layouts) { layouts = new Map(); this.globalPlacements.set(windowId, layouts); }
    } else layouts = tabId ? this.tabs.get(tabId)?.placements : undefined;
    if (!layouts) return { ...initial };
    let placement = layouts.get(pin.id);
    if (!placement) { placement = { ...initial, z: ++this.z }; layouts.set(pin.id, placement); }
    return placement;
  }
  front(placement: Placement): void { placement.z = ++this.z; }
  setGlobal(id: string, global: boolean, windowId: string, current: Placement): void {
    const pin = this.pins.get(id); if (!pin) return;
    pin.global = global;
    if (global) {
      let layouts = this.globalPlacements.get(windowId);
      if (!layouts) { layouts = new Map(); this.globalPlacements.set(windowId, layouts); }
      layouts.set(id, { ...current });
    } else {
      for (const tab of this.tabs.values()) if (tab.note === pin.note && !tab.placements.has(id)) tab.placements.set(id, { ...current });
      for (const layouts of this.globalPlacements.values()) layouts.delete(id);
    }
  }
  remove(id: string): void {
    this.pins.delete(id);
    for (const tab of this.tabs.values()) tab.placements.delete(id);
    for (const layouts of this.globalPlacements.values()) layouts.delete(id);
  }
  rename(oldPath: string, newPath: string): void {
    const move = (p: string) => p === oldPath ? newPath : p.startsWith(oldPath + '/') ? newPath + p.slice(oldPath.length) : p;
    for (const pin of this.pins.values()) { pin.note = move(pin.note); pin.source.path = move(pin.source.path); }
    for (const tab of this.tabs.values()) tab.note = move(tab.note);
  }
  clear(): void { this.pins.clear(); this.tabs.clear(); this.globalPlacements.clear(); }
}
