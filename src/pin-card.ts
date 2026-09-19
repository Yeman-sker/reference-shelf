import { Component, Menu, setIcon } from 'obsidian';
import type { ReferenceAdapter } from './image-adapter';
import { fitPlacement, pinRatio, pinRect, placementHeight, settleSide, type Bounds, type Pin, type Placement } from './state';
import { morphFrames, reducedMotion, snapPlacement, type Frame } from './motion';
import { ResizeGesture } from './resize-gesture';

export interface PinActions {
  remove(): void; crop(): void; resetCrop(): void; duplicate(): void; preview(): void;
  toggleGlobal(): void; front(): void;
}

export class PinCard extends Component {
  readonly el: HTMLElement;
  private readonly viewport: HTMLElement;
  private readonly tools: HTMLElement;
  private readonly orb: HTMLButtonElement;
  private readonly label: HTMLElement;
  private motion: Animation | null = null;
  private effects: Animation[] = [];
  private ignoreClick = false;
  private clickTimer: number | null = null;
  private menu: Menu | null = null;
  private resourceKey = '';
  private cleanup: (() => void) | null = null;
  private abort: (() => void) | null = null;
  private image: HTMLImageElement | null = null;
  private gestureBounds: Bounds | null = null;
  private translationBase: Frame | null = null;
  constructor(parent: HTMLElement, readonly pin: Pin, readonly placement: Placement,
    private readonly adapter: ReferenceAdapter, private readonly bounds: () => Bounds,
    private readonly actions: PinActions, private readonly scene: (active: boolean, candidate?: Frame) => void) {
    super();
    this.el = parent.createEl('section', { cls: 'rs-pin', attr: { 'aria-labelledby': `rs-label-${pin.id}`, 'data-pin-id': pin.id, tabindex: '0', 'aria-description': 'Drag the image to move. Arrow keys move; Shift makes fine adjustments. Enter folds or unfolds.' } });
    this.label = this.el.createSpan({ cls: 'rs-sr-only', attr: { id: `rs-label-${pin.id}` } });
    this.viewport = this.el.createDiv({ cls: 'rs-image-window' });
    this.tools = this.el.createDiv({ cls: 'rs-tools', attr: { role: 'group', 'aria-label': 'Reference controls' } });
    const button = (name: string, icon: string, callback: () => void) => {
      const b = this.tools.createEl('button', { cls: 'clickable-icon', attr: { type: 'button', 'aria-label': name, title: name } });
      setIcon(b, icon); this.registerDomEvent(b, 'click', callback); return b;
    };
    button('Collapse reference', 'minimize-2', () => this.toggleCollapse());
    button('Reference actions', 'ellipsis', () => this.showMenu(this.tools));
    button('Unpin reference', 'x', actions.remove);
    this.orb = this.el.createEl('button', { cls: 'rs-orb', attr: { type: 'button', 'aria-label': 'Expand reference' } });
    setIcon(this.orb, 'image'); this.registerDomEvent(this.orb, 'click', () => this.toggleCollapse());
    for (const corner of ['nw', 'ne', 'sw', 'se']) {
      const handle = this.el.createDiv({ cls: `rs-resize rs-resize-${corner}`, attr: { role: 'button', tabindex: '0', 'aria-label': `Resize reference ${corner}` } });
      this.registerDomEvent(handle, 'pointerdown', event => this.gesture(event, corner));
      this.registerDomEvent(handle, 'keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        placement.width += ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -10 : 10;
        this.constrain(); this.draw();
      });
    }
    this.registerDomEvent(this.el, 'pointerdown', event => {
      const target = event.target as Element;
      if (target.closest('.rs-tools, .rs-resize, .rs-error button')) return;
      this.gesture(event, 'move');
    });
    this.registerDomEvent(this.el, 'click', event => { if (this.ignoreClick) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
    this.registerDomEvent(this.el, 'keydown', event => {
      if (event.target !== this.el && event.target !== this.orb) return;
      if (event.key === 'Enter' && event.target === this.el) { event.preventDefault(); this.toggleCollapse(); return; }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const step = event.shiftKey ? 1 : 10;
      if (event.key === 'ArrowLeft') placement.x -= step;
      if (event.key === 'ArrowRight') placement.x += step;
      if (event.key === 'ArrowUp') placement.y -= step;
      if (event.key === 'ArrowDown') placement.y += step;
      this.constrain(); settleSide(placement, pin, this.bounds()); this.draw();
    });
    this.registerDomEvent(this.el, 'pointerdown', event => { event.stopPropagation(); if (!this.cleanup) { actions.front(); this.draw(); } });
    this.registerDomEvent(this.viewport, 'dblclick', actions.preview);
    this.registerDomEvent(this.el, 'contextmenu', event => { event.preventDefault(); event.stopPropagation(); this.showMenu(this.el); });
    this.update();
  }
  private showMenu(header: HTMLElement): void {
    this.menu?.hide(); const menu = new Menu().setUseNativeMenu(false); this.menu = menu;
    this.el.classList.add('is-menu-open');
    menu.addItem(i => i.setTitle('Adjust crop').setIcon('crop').onClick(this.actions.crop));
    menu.addItem(i => i.setTitle('Restore full image').setIcon('scan').onClick(this.actions.resetCrop));
    menu.addItem(i => i.setTitle('View full image').setIcon('maximize').onClick(this.actions.preview));
    menu.addItem(i => i.setTitle('Duplicate reference').setIcon('copy').onClick(this.actions.duplicate));
    menu.addSeparator();
    menu.addItem(i => i.setTitle(this.pin.global ? 'Follow source note' : 'Keep across notes').setIcon('pin').setChecked(this.pin.global).onClick(this.actions.toggleGlobal));
    if (this.placement.collapsed) menu.addItem(i => i.setTitle('Expand reference').setIcon('expand').onClick(() => this.toggleCollapse()));
    menu.addSeparator(); menu.addItem(i => i.setTitle('Unpin reference').setIcon('x').onClick(this.actions.remove));
    menu.onHide(() => { if (this.menu === menu) { this.menu = null; this.el.classList.remove('is-menu-open'); } });
    const rect = header.getBoundingClientRect(); menu.showAtPosition({ x: rect.right, y: rect.bottom }, header.ownerDocument);
  }
  private constrain(): void { Object.assign(this.placement, fitPlacement(this.placement, this.pin, this.gestureBounds ?? this.bounds())); }
  private cancelMotion(): void {
    this.motion?.cancel(); this.motion = null; for (const effect of this.effects) effect.cancel(); this.effects = [];
    this.el.classList.remove('is-morphing');
  }
  private toggleCollapse(): void {
    const active = this.el.ownerDocument.activeElement;
    const keyboard = !!active && this.el.contains(active) && active.matches(':focus-visible');
    const win = this.el.ownerDocument.defaultView!, morphing = this.el.classList.contains('is-morphing');
    const opacity = morphing ? Number(win.getComputedStyle(this.viewport).opacity) : Number(!this.placement.collapsed);
    const orbOpacity = Number(win.getComputedStyle(this.orb).opacity), radius = Number.parseFloat(win.getComputedStyle(this.el).borderTopLeftRadius);
    const rect = this.el.getBoundingClientRect(), parent = this.el.parentElement!.getBoundingClientRect();
    const from = { x: rect.x - parent.x, y: rect.y - parent.y, width: rect.width, height: rect.height };
    this.cancelMotion(); this.placement.collapsed = !this.placement.collapsed; this.draw();
    if (keyboard) (this.placement.collapsed ? this.orb : this.el).focus({ preventScroll: true });
    if (reducedMotion(this.el)) { settleSide(this.placement, this.pin, this.bounds()); this.draw(); return; }
    this.el.classList.add('is-morphing');
    const folded = this.placement.collapsed, to = pinRect(this.placement, this.pin);
    const motion = this.el.animate(morphFrames(from, to, this.placement.side === 'right', folded, radius), { duration: 460, easing: 'cubic-bezier(.25,.8,.3,1)' });
    this.motion = motion;
    this.effects = [this.viewport.animate([{ opacity }, { opacity: folded ? 0 : 1 }], { duration: 300, fill: 'forwards' }),
      this.orb.animate([{ opacity: orbOpacity }, { opacity: folded ? 1 : 0 }], { duration: 360, fill: 'forwards' })];
    motion.onfinish = () => { if (this.motion === motion) { this.cancelMotion(); if (!folded) { settleSide(this.placement, this.pin, this.bounds()); this.draw(); } } };
  }
  land(dx = 0, dy = 0): void {
    this.cancelMotion(); if (reducedMotion(this.el)) return;
    const motion = this.el.animate([{ transform: `translate(${dx}px,${dy}px) scale(1.025)` }, { transform: 'translate(0,0) scale(.992)', offset: .72 }, { transform: 'translate(0,0) scale(1)' }], { duration: 280, easing: 'cubic-bezier(.2,.75,.3,1)' });
    this.motion = motion; motion.onfinish = () => { if (this.motion === motion) this.cancelMotion(); };
  }
  private gesture(event: PointerEvent, kind: string): void {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); this.cleanup?.(); this.actions.front();
    // Capture a running landing/expansion before cancelling its compositor transform.
    if (this.motion && !this.placement.collapsed) {
      const r = this.el.getBoundingClientRect(), parent = this.el.parentElement!.getBoundingClientRect();
      this.cancelMotion(); Object.assign(this.placement, { x: r.x - parent.x, y: r.y - parent.y, width: r.width });
    }
    this.draw(); this.gestureBounds = this.bounds();
    const start = { ...this.placement }, x = event.clientX, y = event.clientY;
    const doc = this.el.ownerDocument, win = doc.defaultView!; let moved = false;
    const bounds = this.gestureBounds, resize = new ResizeGesture(start, this.pin, kind, bounds);
    let frame: number | null = null, latest: { x: number; y: number } | null = null;
    const apply = () => {
      frame = null; if (!latest) return;
      const point = latest; latest = null;
      if (kind === 'move') {
        this.placement.x = start.x + point.x - x; this.placement.y = start.y + point.y - y;
        this.constrain(); this.draw();
        const snap = snapPlacement(this.placement, this.pin, bounds);
        this.scene(true, snap.x !== this.placement.x || snap.y !== this.placement.y ? pinRect(snap, this.pin) : undefined);
      } else {
        Object.assign(this.placement, resize.update(point.x - x, point.y - y));
        this.draw(); this.scene(true);
      }
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      if (!moved && Math.hypot(e.clientX - x, e.clientY - y) < 4) return;
      if (!moved) {
        moved = true; this.cancelMotion(); this.el.classList.add('is-manipulating'); this.el.setPointerCapture(e.pointerId);
        if (kind === 'move') this.translationBase = pinRect(start, this.pin);
      }
      latest = { x: e.clientX, y: e.clientY };
      if (frame === null) frame = win.requestAnimationFrame(apply);
    };
    const end = () => {
      if (frame !== null) { win.cancelAnimationFrame(frame); apply(); }
      const before = pinRect(this.placement, this.pin);
      if (moved && kind === 'move') Object.assign(this.placement, snapPlacement(this.placement, this.pin, bounds));
      if (moved) settleSide(this.placement, this.pin, bounds);
      this.cleanup?.(); this.draw();
      if (moved) {
        this.ignoreClick = true; if (this.clickTimer !== null) win.clearTimeout(this.clickTimer);
        this.clickTimer = win.setTimeout(() => { this.ignoreClick = false; this.clickTimer = null; }, 0);
        const after = pinRect(this.placement, this.pin);
        if (kind === 'move' && (before.x !== after.x || before.y !== after.y)) this.land(before.x - after.x, before.y - after.y);
      }
    };
    const cancel = () => { Object.assign(this.placement, start); this.cleanup?.(); this.draw(); };
    this.abort = cancel;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { cancel(); e.preventDefault(); e.stopPropagation(); } };
    this.cleanup = () => {
      if (frame !== null) win.cancelAnimationFrame(frame); frame = null; latest = null;
      this.gestureBounds = null; this.translationBase = null; this.el.style.removeProperty('transform');
      doc.removeEventListener('pointermove', move, true); doc.removeEventListener('pointerup', end, true);
      doc.removeEventListener('pointercancel', cancel, true); doc.removeEventListener('keydown', key, true); win.removeEventListener('blur', cancel);
      if (this.el.hasPointerCapture(event.pointerId)) this.el.releasePointerCapture(event.pointerId);
      this.el.classList.remove('is-manipulating'); if (moved) this.scene(false); this.cleanup = null; this.abort = null;
    };
    doc.addEventListener('pointermove', move, true); doc.addEventListener('pointerup', end, true);
    doc.addEventListener('pointercancel', cancel, true); doc.addEventListener('keydown', key, true); win.addEventListener('blur', cancel);
  }
  interrupt(): void { this.abort?.(); this.cancelMotion(); this.constrain(); settleSide(this.placement, this.pin, this.bounds()); this.draw(); }
  draw(): void {
    this.constrain(); const p = this.placement;
    if (!p.side) settleSide(p, this.pin, this.bounds());
    const rect = pinRect(p, this.pin);
    if (this.translationBase) {
      this.el.style.transform = `translate3d(${rect.x - this.translationBase.x}px,${rect.y - this.translationBase.y}px,0)`;
      return;
    }
    Object.assign(this.el.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px`, zIndex: String(p.z), transformOrigin: p.side === 'right' ? '100% 0' : '0 0' });
    const imageWidth = this.image ? Math.min(p.width, placementHeight({ ...p, collapsed: false }, this.pin) * pinRatio(this.pin)) : p.width;
    Object.assign(this.viewport.style, { width: `${100 * imageWidth / p.width}%`, marginLeft: `${50 * (p.width - imageWidth) / p.width}%` });
    this.el.classList.toggle('is-collapsed', p.collapsed); this.el.classList.toggle('is-global', this.pin.global);
    this.el.dataset.note = this.pin.note; this.el.dataset.side = p.side;
    this.el.tabIndex = p.collapsed ? -1 : 0; this.orb.tabIndex = p.collapsed ? 0 : -1;
    this.orb.setAttribute('aria-hidden', String(!p.collapsed));
    this.viewport.setAttribute('aria-hidden', String(p.collapsed));
    if (this.image) {
      const c = this.pin.crop;
      Object.assign(this.image.style, { width: `${100 / c.w}%`, height: `${100 / c.h}%`, left: `${-100 * c.x / c.w}%`, top: `${-100 * c.y / c.h}%` });
    }
  }
  update(force = false): void {
    const resource = this.adapter.resource(this.pin.source);
    const key = `${this.pin.source.path}:${resource ?? 'missing'}`;
    this.label.textContent = `Pinned reference: ${this.pin.source.path}`;
    this.orb.title = `${this.pin.source.path}\n${this.pin.global ? 'Across notes' : this.pin.note}`;
    if (force || key !== this.resourceKey) {
      this.resourceKey = key; this.image = null; this.viewport.replaceChildren();
      if (!resource) this.error();
      else {
        const image = this.viewport.createEl('img', { attr: { alt: this.pin.source.path, draggable: 'false' } });
        this.image = image; image.decoding = 'async';
        image.onload = () => {
          if (this.image !== image) return;
          this.pin.imageWidth = image.naturalWidth; this.pin.imageHeight = image.naturalHeight; this.draw();
        };
        image.onerror = () => { if (this.image === image) this.error(); };
        image.src = resource;
      }
    }
    this.draw();
  }
  private error(): void {
    this.image = null; this.viewport.replaceChildren();
    const error = this.viewport.createDiv({ cls: 'rs-error', attr: { role: 'status' } });
    error.createEl('strong', { text: 'Image unavailable' }); error.createEl('span', { text: this.pin.source.path });
    const retry = error.createEl('button', { text: 'Retry' }); retry.onclick = () => this.update(true);
  }
  onunload(): void {
    this.cleanup?.(); this.cancelMotion(); this.menu?.hide();
    if (this.clickTimer !== null) this.el.ownerDocument.defaultView?.clearTimeout(this.clickTimer);
    if (this.image) { this.image.onload = null; this.image.onerror = null; } this.el.remove();
  }
}
