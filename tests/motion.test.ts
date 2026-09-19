import { describe, expect, it } from 'vitest';
import { fitPlacement, pinRect, settleSide, ShelfStore, type Placement } from '../src/state';
import { morphFrames, snapPlacement } from '../src/motion';
const pin = new ShelfStore().add('A.md', { path: 'figure.svg', type: 'image' }, 1000, 660);
const bounds = { width: 1200, height: 800 };
const place = (extra: Partial<Placement> = {}): Placement => ({ x: 850, y: 100, width: 320, collapsed: false, z: 1, side: 'right', ...extra });

describe('headerless frame and corner-anchored orb', () => {
  it('uses the image ratio without reserving header space', () => {
    expect(pinRect(place(), pin)).toEqual({ x: 850, y: 100, width: 320, height: 211.2 });
  });
  it.each(['left', 'right'] as const)('folds to its %s upper corner without destroying size', side => {
    const p = place({ side }), open = pinRect(p, pin); p.collapsed = true; const closed = pinRect(p, pin);
    expect(closed.width).toBe(44); expect(closed.height).toBe(44); expect(closed.y).toBe(open.y);
    expect(side === 'right' ? closed.x + closed.width : closed.x).toBe(side === 'right' ? open.x + open.width : open.x);
    p.collapsed = false; expect(pinRect(p, pin)).toEqual(open);
  });
  it('lets the orb reach either screen edge and change sides without jumping', () => {
    const p = place({ collapsed: true, x: -276 }); const before = pinRect(p, pin);
    Object.assign(p, fitPlacement(p, pin, bounds)); expect(pinRect(p, pin)).toEqual(before);
    settleSide(p, pin, bounds); expect(p.side).toBe('left'); expect(pinRect(p, pin)).toEqual(before);
    p.x = 1156; const right = pinRect(p, pin); settleSide(p, pin, bounds);
    expect(p.side).toBe('right'); expect(pinRect(p, pin)).toEqual(right); expect(p.width).toBe(320);
  });
  it('fits the actual orb, not its invisible expanded footprint, in a small window', () => {
    const p = fitPlacement(place({ collapsed: true }), pin, { width: 70, height: 60 }); const rect = pinRect(p, pin);
    expect(p.width).toBe(320); expect(rect.x).toBeGreaterThanOrEqual(0); expect(rect.x + rect.width).toBeLessThanOrEqual(70);
    expect(rect.y + rect.height).toBeLessThanOrEqual(60);
  });
  it('preserves an expanded right anchor when width is constrained', () => {
    const p = fitPlacement(place({ x: 100, y: 20, width: 500 }), pin, { width: 700, height: 200 });
    expect(p.x + p.width).toBe(600); expect(pinRect(p, pin).height).toBeLessThanOrEqual(200);
  });
  it('senses sides only when explicitly settled, with centre hysteresis', () => {
    const p = place({ x: 421, side: 'left' }); settleSide(p, pin, bounds); expect(p.side).toBe('left');
    p.x = 450; settleSide(p, pin, bounds); expect(p.side).toBe('right');
    p.x = 440; settleSide(p, pin, bounds); expect(p.side).toBe('right');
  });
});
describe('magnetic landing and bounded jelly motion', () => {
  it('snaps close edges, but leaves free placement alone', () => {
    const free = place({ x: 500, y: 200 }); expect(snapPlacement(free, pin, bounds)).toMatchObject(free);
    expect(snapPlacement(place({ x: 5, y: 18 }), pin, bounds)).toMatchObject({ x: 12, y: 12 });
    const right = snapPlacement(place({ x: 878 }), pin, bounds); expect(right.x + right.width).toBe(1188);
  });
  it('snaps collapsed geometry without consuming the expanded width', () => {
    const p = snapPlacement(place({ x: -270, collapsed: true }), pin, bounds);
    expect(pinRect(p, pin).x).toBe(12); expect(p.width).toBe(320);
  });
  it.each(['left', 'right'] as const)('holds the %s corner throughout the morph', side => {
    const from = pinRect(place({ side }), pin), to = pinRect(place({ side, collapsed: true }), pin);
    const frames = morphFrames(from, to, side === 'right', true);
    for (const f of frames) {
      expect(Number.parseFloat(String(f.top))).toBe(100);
      const left = Number.parseFloat(String(f.left)), width = Number.parseFloat(String(f.width));
      expect(width).toBeGreaterThan(0); expect(Number.parseFloat(String(f.height))).toBeGreaterThan(0);
      expect(side === 'right' ? left + width : left).toBeCloseTo(side === 'right' ? 1170 : 850);
    }
    expect(frames.at(-1)).toMatchObject({ width: '44px', height: '44px', borderRadius: '22px' });
  });
  it('keeps rebound bounded even for a huge source frame', () => {
    const frames = morphFrames({ x: 0, y: 0, width: 8000, height: 5000 }, { x: 7956, y: 0, width: 44, height: 44 }, true, true);
    expect(Number.parseFloat(String(frames[1]!.width))).toBeCloseTo(44 * .9);
    expect(Number.parseFloat(String(frames[2]!.width))).toBeCloseTo(44 * 1.035);
  });
});
