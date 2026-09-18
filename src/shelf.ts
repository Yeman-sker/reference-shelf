import { Component, MarkdownView, setIcon } from 'obsidian';
import type { ReferenceAdapter } from './image-adapter';
import { clampHeight, type ImageSource, type TabState } from './state';

interface ShelfActions { unpin(): void; saveHeight(height: number): void }

/** The only layout integration: an owned sibling before the public contentEl.
 * Never wrap/reparent the editor or mutate workspace splits. */
export class Shelf extends Component {
  readonly el: HTMLElement;
  private readonly header: HTMLElement;
  private readonly title: HTMLElement;
  private readonly viewport: HTMLElement;
  private readonly divider: HTMLElement;
  private readonly collapseButton: HTMLButtonElement;
  private currentSource: ImageSource | null = null;
  private resourceKey = '';
  private resize: ResizeObserver;
  private dragCleanup: (() => void) | null = null;

  constructor(readonly view: MarkdownView, private readonly state: TabState,
    private readonly adapter: ReferenceAdapter, private readonly actions: ShelfActions) {
    super();
    const doc = view.containerEl.ownerDocument;
    this.el = doc.createElement('section');
    this.el.className = 'reference-shelf';
    this.el.setAttribute('aria-label', 'Reference Shelf');
    this.header = this.el.createDiv({ cls: 'reference-shelf-header' });
    this.title = this.header.createSpan({ cls: 'reference-shelf-title' });
    const button = (name: string, icon: string, callback: () => void) => {
      const b = this.header.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': name, title: name, type: 'button' } });
      setIcon(b, icon);
      this.registerDomEvent(b, 'click', callback);
      return b;
    };
    button('Fit image', 'scan', () => { this.state.collapsed = false; this.size(); });
    this.collapseButton = button('Collapse reference', 'chevron-up', () => { this.state.collapsed = !this.state.collapsed; this.size(); });
    button('Unpin reference', 'x', actions.unpin);
    this.viewport = this.el.createDiv({ cls: 'reference-shelf-viewport' });
    this.divider = this.el.createDiv({ cls: 'reference-shelf-divider', attr: { role: 'separator', tabindex: '0', 'aria-label': 'Resize reference shelf', 'aria-orientation': 'horizontal' } });
    this.registerDomEvent(this.divider, 'pointerdown', e => this.startResize(e));
    this.registerDomEvent(this.divider, 'keydown', e => {
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const height = this.state.height || this.available() * 0.32;
      this.state.height = clampHeight(e.key === 'Home' ? 180 : e.key === 'End' ? this.available() : height + (e.key === 'ArrowUp' ? -10 : 10), this.available());
      this.state.collapsed = false;
      this.size(); this.actions.saveHeight(this.state.height);
    });
    view.containerEl.insertBefore(this.el, view.contentEl);
    view.containerEl.classList.add('reference-shelf-host');
    // Use the owning window, including popouts, rather than the main window.
    const win = doc.defaultView ?? window;
    this.resize = new win.ResizeObserver(() => this.size());
    this.resize.observe(view.containerEl);
    this.size();
  }
  private available(): number {
    const header = this.view.containerEl.querySelector(':scope > .view-header') as HTMLElement | null;
    return Math.max(0, this.view.containerEl.clientHeight - (header?.offsetHeight ?? 0));
  }
  private size(): void {
    const available = this.available();
    if (!available) return; // Hidden tab: do not destroy remembered dimensions.
    const height = clampHeight(this.state.height || available * 0.32, available);
    this.el.style.height = `${this.state.collapsed ? 32 : height}px`;
    this.el.classList.toggle('is-collapsed', this.state.collapsed);
    const label = this.state.collapsed ? 'Expand reference' : 'Collapse reference';
    this.collapseButton.setAttribute('aria-label', label);
    this.collapseButton.title = label;
    setIcon(this.collapseButton, this.state.collapsed ? 'chevron-down' : 'chevron-up');
    this.divider.setAttribute('aria-valuemin', String(Math.min(180, Math.floor(available * 0.7))));
    this.divider.setAttribute('aria-valuemax', String(Math.floor(available * 0.7)));
    this.divider.setAttribute('aria-valuenow', String(Math.round(height)));
  }
  private startResize(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    this.dragCleanup?.();
    const start = event.clientY;
    const height = this.el.getBoundingClientRect().height;
    const doc = this.el.ownerDocument;
    const move = (e: PointerEvent) => {
      this.state.height = clampHeight(height + e.clientY - start, this.available());
      this.state.collapsed = false;
      this.size();
    };
    const end = () => { this.dragCleanup?.(); this.actions.saveHeight(this.state.height); };
    this.dragCleanup = () => {
      doc.removeEventListener('pointermove', move, true);
      doc.removeEventListener('pointerup', end, true);
      doc.removeEventListener('pointercancel', end, true);
      this.el.classList.remove('is-resizing');
      this.dragCleanup = null;
    };
    this.el.classList.add('is-resizing');
    doc.addEventListener('pointermove', move, true);
    doc.addEventListener('pointerup', end, true);
    doc.addEventListener('pointercancel', end, true);
  }
  update(source: ImageSource, force = false): void {
    this.currentSource = source;
    const resource = this.adapter.resource(source);
    const key = `${source.path}:${resource ?? 'missing'}`;
    this.title.textContent = source.path.split('/').pop() ?? source.path;
    this.title.title = source.path;
    this.size();
    if (!force && this.resourceKey === key) return;
    this.resourceKey = key;
    this.viewport.replaceChildren();
    if (!resource) { this.showError(source); return; }
    const img = this.viewport.createEl('img', { attr: { alt: source.path, draggable: 'false' } });
    img.decoding = 'async';
    img.onload = () => { img.onload = null; img.onerror = null; };
    img.onerror = () => { if (img.parentElement === this.viewport) this.showError(source); };
    img.src = resource;
  }
  private showError(source: ImageSource): void {
    this.viewport.replaceChildren();
    const error = this.viewport.createDiv({ cls: 'reference-shelf-error', attr: { role: 'status' } });
    error.createEl('strong', { text: 'Image unavailable' });
    error.createEl('span', { text: source.path });
    const retry = error.createEl('button', { text: 'Retry', attr: { type: 'button' } });
    retry.onclick = () => { if (this.currentSource) this.update(this.currentSource, true); };
  }
  onunload(): void {
    this.dragCleanup?.();
    this.resize.disconnect();
    this.el.remove();
    this.view.containerEl.classList.remove('reference-shelf-host');
  }
}
