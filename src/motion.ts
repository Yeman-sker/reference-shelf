import type { Bounds, Pin, Placement } from './state';
import { fitPlacement, pinRect } from './state';
export interface Frame { x: number; y: number; width: number; height: number }
export const reducedMotion = (el: HTMLElement): boolean => el.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches ?? true;
export function snapPlacement(p: Placement, pin: Pin, bounds: Bounds): Placement {
  const next = { ...p }, r = pinRect(p, pin);
  if (r.x < 22) next.x += 12 - r.x;
  else if (bounds.width - r.x - r.width < 22) next.x += bounds.width - r.width - 12 - r.x;
  if (r.y < 22) next.y = 12;
  else if (bounds.height - r.y - r.height < 22) next.y = bounds.height - r.height - 12;
  return fitPlacement(next, pin, bounds);
}
/** Corner-anchored, damped shape change; no delayed pointer-follow interpolation. */
export function morphFrames(from: Frame, to: Frame, right: boolean, collapsing: boolean, radius = collapsing ? 14 : 22): Keyframe[] {
  const key = (r: Frame, radius: number, offset: number): Keyframe => ({ left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: `${radius}px`, offset });
  const shape = (sx: number, sy: number): Frame => ({ x: right ? to.x + to.width * (1 - sx) : to.x, y: to.y, width: to.width * sx, height: to.height * sy });
  return [key(from, radius, 0), key(shape(collapsing ? .9 : 1.025, collapsing ? .94 : .992), collapsing ? 22 : 14, .7),
    key(shape(collapsing ? 1.035 : .994, collapsing ? 1.02 : 1.008), collapsing ? 22 : 14, .86), key(to, collapsing ? 22 : 14, 1)];
}
