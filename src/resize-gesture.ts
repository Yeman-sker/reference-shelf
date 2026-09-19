import { pinRatio, placementHeight, type Bounds, type Pin, type Placement } from './state';

/** Continuous projection onto the aspect-ratio diagonal, with a fixed opposite corner. */
export class ResizeGesture {
  private correction = 0;
  private readonly west: boolean;
  private readonly north: boolean;
  private readonly ratio: number;
  private readonly anchorX: number;
  private readonly anchorY: number;
  private readonly maximum: number;
  private readonly minimum: number;
  constructor(private readonly start: Placement, private readonly pin: Pin, corner: string, bounds: Bounds) {
    this.west = corner.includes('w'); this.north = corner.includes('n'); this.ratio = pinRatio(pin);
    this.anchorX = start.x + (this.west ? start.width : 0);
    this.anchorY = start.y + (this.north ? placementHeight(start, pin) : 0);
    const horizontal = Math.max(1, this.west ? this.anchorX : bounds.width - this.anchorX);
    const vertical = Math.max(1, this.north ? this.anchorY : bounds.height - this.anchorY);
    this.maximum = Math.min(horizontal, Math.max(Math.min(160, horizontal), vertical * this.ratio));
    this.minimum = Math.min(160, this.maximum);
  }
  update(dx: number, dy: number): Placement {
    const x = this.west ? -dx : dx, y = this.north ? -dy : dy, slope = 1 / this.ratio;
    const projected = (x + y * slope) / (1 + slope * slope);
    const desired = this.start.width + projected + this.correction;
    const width = Math.max(this.minimum, Math.min(this.maximum, desired));
    // Discard overdrag at the boundary: reversing the pointer immediately changes size.
    this.correction += width - desired;
    const next = { ...this.start, width, collapsed: false };
    next.x = this.anchorX - (this.west ? width : 0);
    next.y = this.anchorY - (this.north ? placementHeight(next, this.pin) : 0);
    return next;
  }
}
