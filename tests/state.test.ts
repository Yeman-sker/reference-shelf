import { describe, expect, it } from 'vitest';
import { ShelfStore, FULL_CROP, fitPlacement, pinRatio, placementHeight, validCrop, type Placement } from '../src/state';
import { isImage, localLink } from '../src/source';
const image = { type: 'image' as const, path: 'assets/a.png' };
const layout: Placement = { x: 20, y: 30, width: 300, collapsed: false, z: 1 };
const open = () => new Map([['1', 'A.md'], ['2', 'A.md'], ['3', 'B.md']]);
describe('multiple note references, independent tab placement', () => {
  it('adds multiple pins including different crops of the same image', () => {
    const s = new ShelfStore(); s.reconcile(open());
    const a = s.add('A.md', image, 1000, 500, { x: 0, y: 0, w: .5, h: 1 });
    const b = s.add('A.md', image, 1000, 500, { x: .5, y: 0, w: .5, h: 1 });
    expect(a.id).not.toBe(b.id); expect(s.visible('A.md')).toHaveLength(2); expect(s.visible('B.md')).toHaveLength(0);
    expect(pinRatio(a)).toBe(1); expect(b.crop.x).toBe(.5);
  });
  it('shares pin/crop/remove but not position, size, collapse or z order', () => {
    const s = new ShelfStore(); s.reconcile(open()); const pin = s.add('A.md', image);
    const a = s.layout(pin, '1', 'w1', layout), b = s.layout(pin, '2', 'w1', layout);
    a.x = 800; a.width = 500; a.collapsed = true; s.front(a);
    expect(b.x).toBe(20); expect(b.width).toBe(300); expect(b.collapsed).toBe(false); expect(a.z).toBeGreaterThan(b.z);
    pin.crop = { x: .5, y: 0, w: .5, h: 1 }; expect(s.visible('A.md')[0]?.crop.x).toBe(.5);
    s.remove(pin.id); expect(s.tabs.get('1')!.placements.size + s.tabs.get('2')!.placements.size).toBe(0);
  });
  it('preserves inactive tabs and releases the final note membership', () => {
    const s = new ShelfStore(); s.reconcile(open()); s.add('A.md', image);
    s.reconcile(new Map([['2', 'A.md'], ['3', 'B.md']])); expect(s.visible('A.md')).toHaveLength(1);
    s.reconcile(new Map([['2', 'B.md']])); expect(s.pins.size).toBe(0);
  });
  it('preserves identities and geometry when tabs move between groups', () => {
    const s = new ShelfStore(); s.reconcile(open()); const pin = s.add('A.md', image);
    const p = s.layout(pin, '1', 'w1', layout); s.reconcile(new Map([...open()].reverse()));
    expect(s.layout(pin, '1', 'w1', layout)).toBe(p);
  });
  it('global pins survive last-tab closure and use window-local geometry', () => {
    const s = new ShelfStore(); s.reconcile(open()); const pin = s.add('A.md', image);
    s.setGlobal(pin.id, true, 'w1', layout); s.reconcile(new Map());
    expect(s.visible(null)).toHaveLength(1); expect(s.visible('B.md')).toHaveLength(1);
    const a = s.layout(pin, null, 'w1', layout), b = s.layout(pin, null, 'w2', layout);
    a.x = 800; expect(b.x).toBe(20);
  });
  it('returning to note scope releases a pin whose source note is closed', () => {
    const s = new ShelfStore(); s.reconcile(open()); const pin = s.add('A.md', image);
    s.setGlobal(pin.id, true, 'w1', layout); s.reconcile(new Map());
    s.setGlobal(pin.id, false, 'w1', layout); s.reconcile(new Map()); expect(s.pins.size).toBe(0);
  });
  it('renames notes, sources and folders without losing pin identity', () => {
    const s = new ShelfStore(); s.reconcile(new Map([['1', 'dir/A.md']]));
    const pin = s.add('dir/A.md', { ...image, path: 'dir/a.png' }); s.rename('dir', 'moved');
    expect(s.tabs.get('1')!.note).toBe('moved/A.md'); expect(pin.note).toBe('moved/A.md'); expect(pin.source.path).toBe('moved/a.png');
    s.rename('moved/a.png', 'moved/new.png'); expect(s.pins.get(pin.id)?.source.path).toBe('moved/new.png');
  });
  it('keeps a missing image descriptor for retry and never aliases caller crops', () => {
    const s = new ShelfStore(); s.reconcile(open()); const crop = { ...FULL_CROP }; const pin = s.add('A.md', image, 1000, 500, crop);
    crop.w = .5; s.reconcile(open()); expect(pin.crop.w).toBe(1); expect(pin.source.path).toBe(image.path);
  });
  it('clears all session pins and geometries on unload', () => {
    const s = new ShelfStore(); s.reconcile(open()); const pin = s.add('A.md', image);
    s.setGlobal(pin.id, true, 'w1', layout); s.clear(); expect(s.pins.size + s.tabs.size + s.globalPlacements.size).toBe(0);
  });
});
describe('crop and window geometry', () => {
  it('bounds invalid and nonfinite crop input without zero-area selections', () => {
    expect(validCrop({ x: -1, y: NaN, w: 4, h: 0 })).toEqual({ x: 0, y: 0, w: 1, h: .01 });
    const crop = validCrop({ x: .9, y: .99, w: .7, h: .7 }); expect(crop.x + crop.w).toBe(1); expect(crop.y + crop.h).toBe(1);
  });
  it('allows placement and deliberate overlap anywhere in the window', () => {
    const s = new ShelfStore(), pin = s.add('A.md', image, 1000, 500);
    expect(fitPlacement({ ...layout, x: 650, y: 300, width: 500 }, pin, { width: 1500, height: 900 })).toEqual({ ...layout, x: 650, y: 300, width: 500, maxHeight: 900 });
  });
  it('clamps oversized and off-screen pins while preserving aspect ratio', () => {
    const pin = new ShelfStore().add('A.md', image, 1000, 500);
    const p = fitPlacement({ ...layout, x: 999, y: 999, width: 999 }, pin, { width: 400, height: 300 });
    expect(p.width).toBe(400); expect(p.x).toBe(0); expect(p.y + placementHeight(p, pin)).toBeLessThanOrEqual(300);
  });
  it('handles very tall images and small windows without unreachable controls', () => {
    const pin = new ShelfStore().add('A.md', image, 100, 6000);
    const p = fitPlacement(layout, pin, { width: 200, height: 250 });
    expect(placementHeight(p, pin)).toBeLessThanOrEqual(250); expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.width).toBeGreaterThanOrEqual(160); expect(pinRatio(pin)).toBe(100 / 6000);
  });
  it('collapsed height does not destroy stored width', () => {
    const pin = new ShelfStore().add('A.md', image);
    expect(placementHeight({ ...layout, collapsed: true }, pin)).toBe(28); expect(layout.width).toBe(300);
  });
});
describe('safe local image sources', () => {
  it.each(['a.png','a.JPG','a.jpeg','a.webp','a.svg'])('accepts %s', value => expect(isImage(value)).toBe(true));
  it.each(['a.md','a.excalidraw','a.pdf','https://example.com/a.png','data:image/svg+xml,x','//host/a.png','javascript:foo.png','https%3A%2F%2Fx%2Fa.png'])('rejects %s', value => expect(localLink(value)).toBe(null));
  it('handles wiki sizes, URL encoding and fragments', () => {
    expect(localLink('![[folder/a%20b.png|300]]')).toBe('folder/a b.png'); expect(localLink('<a.png>')).toBe('a.png');
    expect(localLink('a.svg#section')).toBe('a.svg'); expect(localLink('bad%ZZ.png')).toBe(null);
  });
});
