import { Component, Menu, setIcon } from 'obsidian';
import type { ReferenceAdapter } from './image-adapter';
import { HEADER_HEIGHT, fitPlacement, pinRatio, placementHeight, type Bounds, type Pin, type Placement } from './state';

export interface PinActions {
  remove(): void; crop(): void; resetCrop(): void; duplicate(): void; preview(): void;
  toggleGlobal(): void; front(): void;
}

export class PinCard extends Component {
  readonly el: HTMLElement;
  private readonly title: HTMLElement;
  private readonly viewport: HTMLElement;
  private readonly handle: HTMLButtonElement;
  private readonly collapse: HTMLButtonElement;
  private menu: Menu | null = null;
  private resourceKey = '';
  private cleanup: (() => void) | null = null;
  private image: HTMLImageElement | null = null;
  constructor(parent: HTMLElement, readonly pin: Pin, readonly placement: Placement,
    private readonly adapter: ReferenceAdapter, private readonly bounds: () => Bounds,
    private readonly actions: PinActions) {
    super();
    this.el = parent.createEl('section', { cls: 'rs-pin', attr: { 'aria-label': 'Pinned reference', 'data-pin-id': pin.id } });
    const header = this.el.createDiv({ cls: 'rs-pin-header' });
    const button = (name: string, icon: string, callback: () => void) => {
      const b = header.createEl('button', { cls: 'clickable-icon', attr: { type: 'button', 'aria-label': name, title: name } });
      setIcon(b, icon); this.registerDomEvent(b, 'click', callback); return b;
    };
    this.handle = button('Move reference', 'grip-vertical', () => {});
    this.handle.classList.add('rs-move-handle');
    this.title = header.createSpan({ cls: 'rs-pin-title' });
    this.collapse = button('Collapse reference', 'chevron-up', () => { placement.collapsed = !placement.collapsed; this.draw(); });
    button('Reference actions', 'ellipsis', () => this.showMenu(header));
    button('Unpin reference', 'x', actions.remove);
    this.viewport = this.el.createDiv({ cls: 'rs-image-window' });
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
    this.registerDomEvent(this.handle, 'pointerdown', event => this.gesture(event, 'move'));
    this.registerDomEvent(this.handle, 'keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const step = event.shiftKey ? 1 : 10;
      if (event.key === 'ArrowLeft') placement.x -= step;
      if (event.key === 'ArrowRight') placement.x += step;
      if (event.key === 'ArrowUp') placement.y -= step;
      if (event.key === 'ArrowDown') placement.y += step;
      this.constrain(); this.draw();
    });
    this.registerDomEvent(this.el, 'pointerdown', event => { event.stopPropagation(); actions.front(); this.draw(); });
    this.registerDomEvent(this.viewport, 'dblclick', actions.preview);
    this.update();
  }
  private showMenu(header: HTMLElement): void {
    this.menu?.hide(); const menu = new Menu().setUseNativeMenu(false); this.menu = menu;
    menu.addItem(i => i.setTitle('Adjust crop').setIcon('crop').onClick(this.actions.crop));
    menu.addItem(i => i.setTitle('Restore full image').setIcon('scan').onClick(this.actions.resetCrop));
    menu.addItem(i => i.setTitle('View full image').setIcon('maximize').onClick(this.actions.preview));
    menu.addItem(i => i.setTitle('Duplicate reference').setIcon('copy').onClick(this.actions.duplicate));
    menu.addSeparator();
    menu.addItem(i => i.setTitle(this.pin.global ? 'Follow source note' : 'Keep across notes').setIcon('pin').setChecked(this.pin.global).onClick(this.actions.toggleGlobal));
    menu.onHide(() => { if (this.menu === menu) this.menu = null; });
    const rect = header.getBoundingClientRect(); menu.showAtPosition({ x: rect.right, y: rect.bottom }, header.ownerDocument);
  }
  private constrain(): void { Object.assign(this.placement, fitPlacement(this.placement, this.pin, this.bounds())); }
  private gesture(event: PointerEvent, kind: string): void {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); this.cleanup?.(); this.actions.front();
    const start = { ...this.placement }, x = event.clientX, y = event.clientY;
    const doc = this.el.ownerDocument;
    const move = (e: PointerEvent) => {
      if (kind === 'move') {
        this.placement.x = start.x + e.clientX - x; this.placement.y = start.y + e.clientY - y;
      } else {
        const west = kind.includes('w'), north = kind.includes('n');
        const dx = (e.clientX - x) * (west ? -1 : 1);
        const dy = (e.clientY - y) * (north ? -1 : 1) * pinRatio(this.pin);
        this.placement.width = start.width + (Math.abs(dx) >= Math.abs(dy) ? dx : dy); this.placement.collapsed = false;
        const next = fitPlacement(this.placement, this.pin, this.bounds());
        this.placement.width = next.width;
        if (west) this.placement.x = start.x + start.width - next.width;
        if (north) this.placement.y = start.y + placementHeight(start, this.pin) - placementHeight(this.placement, this.pin);
      }
      this.constrain(); this.draw();
    };
    const end = () => {
      if (kind === 'move') {
        const b = this.bounds(), p = this.placement, h = placementHeight(p, this.pin);
        if (p.x < 16) p.x = 8;
        if (b.width - p.x - p.width < 16) p.x = b.width - p.width - 8;
        if (p.y < 16) p.y = 8;
        if (b.height - p.y - h < 16) p.y = b.height - h - 8;
        this.constrain();
      }
      this.cleanup?.(); this.draw();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { Object.assign(this.placement, start); this.cleanup?.(); this.draw(); e.preventDefault(); e.stopPropagation(); } };
    this.cleanup = () => {
      doc.removeEventListener('pointermove', move, true); doc.removeEventListener('pointerup', end, true);
      doc.removeEventListener('pointercancel', end, true); doc.removeEventListener('keydown', key, true);
      this.el.classList.remove('is-manipulating'); this.cleanup = null;
    };
    this.el.classList.add('is-manipulating');
    doc.addEventListener('pointermove', move, true); doc.addEventListener('pointerup', end, true);
    doc.addEventListener('pointercancel', end, true); doc.addEventListener('keydown', key, true);
  }
  draw(): void {
    this.constrain(); const p = this.placement;
    Object.assign(this.el.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${p.width}px`, height: `${placementHeight(p, this.pin)}px`, zIndex: String(p.z) });
    const imageWidth = this.image ? Math.min(p.width, (placementHeight(p, this.pin) - HEADER_HEIGHT) * pinRatio(this.pin)) : p.width;
    Object.assign(this.viewport.style, { width: `${imageWidth}px`, marginLeft: `${(p.width - imageWidth) / 2}px` });
    this.el.classList.toggle('is-collapsed', p.collapsed); this.el.classList.toggle('is-global', this.pin.global);
    this.el.dataset.note = this.pin.note;
    const label = p.collapsed ? 'Expand reference' : 'Collapse reference';
    this.collapse.setAttribute('aria-label', label); this.collapse.title = label;
    setIcon(this.collapse, p.collapsed ? 'chevron-down' : 'chevron-up');
    if (this.image) {
      const c = this.pin.crop;
      Object.assign(this.image.style, { width: `${100 / c.w}%`, height: `${100 / c.h}%`, left: `${-100 * c.x / c.w}%`, top: `${-100 * c.y / c.h}%` });
    }
  }
  update(force = false): void {
    const resource = this.adapter.resource(this.pin.source);
    const key = `${this.pin.source.path}:${resource ?? 'missing'}`;
    this.title.textContent = this.pin.source.path.split('/').pop() ?? '';
    this.title.title = `${this.pin.source.path}\n${this.pin.global ? 'Across notes' : this.pin.note}`;
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
  onunload(): void { this.cleanup?.(); this.menu?.hide(); this.el.remove(); }
}
