import { Component } from 'obsidian';
import type { ReferenceAdapter } from './image-adapter';
import { PinCard, type PinActions } from './pin-card';
import { fitPlacement, pinRatio, placementHeight, type Pin, type Placement, type ShelfStore } from './state';
import { snapPlacement, type Frame } from './motion';

export class ReferenceCanvas extends Component {
  readonly el: HTMLElement;
  readonly cards = new Map<string, PinCard>();
  private ghost: HTMLElement | null = null;
  private hint: HTMLElement | null = null;
  private readonly guide: HTMLElement;
  hidden = false;
  constructor(readonly doc: Document, readonly id: string, private readonly store: ShelfStore,
    private readonly adapter: ReferenceAdapter, private readonly actions: (pin: Pin, placement: Placement) => PinActions) {
    super();
    // One fixed overlay under the application shell, outside all leaves.
    const host = doc.querySelector<HTMLElement>('.app-container') ?? doc.body;
    this.el = host.createDiv({ cls: 'rs-canvas', attr: { role: 'group', 'aria-labelledby': `rs-canvas-label-${id}` } });
    this.el.createSpan({ cls: 'rs-sr-only', text: 'Reference canvas', attr: { id: `rs-canvas-label-${id}` } });
    this.el.createDiv({ cls: 'rs-focus-scrim', attr: { 'aria-hidden': 'true' } });
    this.guide = this.el.createDiv({ cls: 'rs-snap-guide', attr: { 'aria-hidden': 'true' } });
    const win = doc.defaultView ?? window;
    this.registerDomEvent(win, 'resize', () => { for (const card of this.cards.values()) card.interrupt(); });
    const media = win.matchMedia('(prefers-reduced-motion: reduce)');
    const reduce = () => { if (media.matches) for (const card of this.cards.values()) card.interrupt(); };
    media.addEventListener('change', reduce); this.register(() => media.removeEventListener('change', reduce));
  }
  bounds(): { width: number; height: number } {
    return { width: this.el.clientWidth, height: this.el.clientHeight };
  }
  position(pin: Pin, x: number, y: number, width = 280): Placement {
    const rect = this.el.getBoundingClientRect();
    return snapPlacement(fitPlacement({ x: x - rect.left, y: y - rect.top, width, collapsed: false, z: 1 }, pin, this.bounds()), pin, this.bounds());
  }
  initial(pin: Pin, index: number): Placement {
    const width = 280, b = this.bounds();
    return fitPlacement({ x: index % 2 ? b.width - width - 12 : 12, y: 48 + Math.floor(index / 2) * 36, width, collapsed: false, z: 1 }, pin, b);
  }
  render(note: string | null, tab: string | null, force = false): void {
    const visible = this.store.visible(note), ids = new Set(visible.map(pin => pin.id));
    for (const [id, card] of this.cards) if (!ids.has(id)) { this.removeChild(card); this.cards.delete(id); }
    visible.forEach((pin, index) => {
      const placement = this.store.layout(pin, tab, this.id, this.initial(pin, index));
      let card = this.cards.get(pin.id);
      if (card && card.placement !== placement) { this.removeChild(card); this.cards.delete(pin.id); card = undefined; }
      if (!card) {
        card = new PinCard(this.el, pin, placement, this.adapter, () => this.bounds(), this.actions(pin, placement), (active, candidate) => this.manipulate(active, candidate));
        this.addChild(card); this.cards.set(pin.id, card);
      }
      card.update(force);
    });
    this.el.classList.toggle('rs-hidden', this.hidden);
  }
  preview(pin: Pin, x: number, y: number): Placement {
    this.hidden = false; this.el.classList.remove('rs-hidden');
    this.manipulate(true);
    if (!this.ghost) {
      this.ghost = this.el.createDiv({ cls: 'rs-placement-preview' });
      const viewport = this.ghost.createDiv({ cls: 'rs-image-window' });
      const resource = this.adapter.resource(pin.source);
      if (resource) {
        const image = viewport.createEl('img', { attr: { src: resource, alt: '', draggable: 'false' } });
        const c = pin.crop;
        Object.assign(image.style, { width: `${100 / c.w}%`, height: `${100 / c.h}%`, left: `${-100 * c.x / c.w}%`, top: `${-100 * c.y / c.h}%` });
      }
      this.hint = this.el.createDiv({ cls: 'rs-placement-hint', text: 'Place reference anywhere · Esc to cancel', attr: { role: 'status' } });
    }
    const p = this.position(pin, x, y);
    const height = placementHeight(p, pin), width = Math.min(p.width, height * pinRatio(pin));
    Object.assign(this.ghost.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${p.width}px`, height: `${height}px` });
    const viewport = this.ghost.querySelector<HTMLElement>('.rs-image-window');
    if (viewport) Object.assign(viewport.style, { width: `${width}px`, marginLeft: `${(p.width - width) / 2}px` });
    return p;
  }
  manipulate(active: boolean, candidate?: Frame): void {
    this.el.classList.toggle('is-dragging', active); this.guide.classList.toggle('is-visible', !!candidate);
    if (candidate) Object.assign(this.guide.style, { left: `${candidate.x}px`, top: `${candidate.y}px`, width: `${candidate.width}px`, height: `${candidate.height}px` });
  }
  stopPreview(): void { this.ghost?.remove(); this.hint?.remove(); this.ghost = null; this.hint = null; this.manipulate(false); }
  toggle(): void { for (const card of this.cards.values()) card.interrupt(); this.hidden = !this.hidden; this.el.classList.toggle('rs-hidden', this.hidden); }
  onunload(): void { this.stopPreview(); this.el.remove(); }
}
