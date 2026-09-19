import { describe, expect, it } from 'vitest';
import { ResizeGesture } from '../src/resize-gesture';
import { ShelfStore, placementHeight, type Placement } from '../src/state';
const pin = new ShelfStore().add('A.md', { type: 'image', path: 'a.svg' }, 1000, 660);
const start: Placement = { x: 400, y: 350, width: 300, collapsed: false, z: 1 };
const bounds = { width: 1600, height: 1100 };
describe('continuous aspect resize', () => {
  it.each(['nw', 'ne', 'sw', 'se'])('%s preserves its opposite corner and reverses continuously', corner => {
    const resize = new ResizeGesture(start, pin, corner, bounds);
    const west = corner.includes('w'), north = corner.includes('n');
    const anchorX = start.x + (west ? start.width : 0), anchorY = start.y + (north ? placementHeight(start, pin) : 0);
    let last: number | undefined;
    for (const dy of [-38, -39, -40, -41, -40, -39]) {
      const p = resize.update(west ? -60 : 60, north ? -dy : dy);
      expect(p.x + (west ? p.width : 0)).toBeCloseTo(anchorX);
      expect(p.y + (north ? placementHeight(p, pin) : 0)).toBeCloseTo(anchorY);
      if (last !== undefined) expect(Math.abs(last - p.width)).toBeLessThan(1);
      last = p.width;
    }
  });
  it.each(['nw', 'ne', 'sw', 'se'])('%s reverses immediately after overdragging a boundary', corner => {
    const resize = new ResizeGesture(start, pin, corner, bounds), sx = corner.includes('w') ? -1 : 1, sy = corner.includes('n') ? -1 : 1;
    const max = resize.update(sx * 3000, sy * 1980);
    const back = resize.update(sx * 2990, sy * 1973.4);
    expect(back.width).toBeCloseTo(max.width - 10);
    const min = resize.update(-sx * 3000, -sy * 1980);
    const grow = resize.update(-sx * 2990, -sy * 1973.4);
    expect(grow.width).toBeCloseTo(min.width + 10);
  });
  it('tracks the aspect diagonal exactly without altering the input placement', () => {
    const p = new ResizeGesture(start, pin, 'se', bounds).update(100, 66);
    expect(p.width).toBeCloseTo(400); expect(start.width).toBe(300);
  });
});
