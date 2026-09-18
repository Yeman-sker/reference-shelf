import { Component } from 'obsidian';
import { FULL_CROP, validCrop, type Crop } from './state';

/** A view-only selection on the original resource. No canvas export or vault write. */
export class CropEditor extends Component {
  readonly el: HTMLDialogElement;
  private readonly image: HTMLImageElement;
  private readonly selection: HTMLElement;
  private readonly inputs = new Map<keyof Crop, HTMLInputElement>();
  private crop: Crop;
  private cleanup: (() => void) | null = null;
  private finished = false;
  constructor(doc: Document, resource: string, initial: Crop,
    private readonly commit: (crop: Crop, width: number, height: number) => void,
    private readonly closed: () => void) {
    super(); this.crop = { ...initial };
    this.el = doc.createElement('dialog'); this.el.className = 'rs-crop-dialog';
    this.el.setAttribute('aria-label', 'Crop reference');
    this.el.createEl('h2', { text: 'Choose a reference region' });
    this.el.createEl('p', { text: 'Drag a rectangle around the part you need. The original image stays unchanged.', cls: 'rs-muted' });
    const stage = this.el.createDiv({ cls: 'rs-crop-stage' });
    this.image = stage.createEl('img', { attr: { alt: 'Original reference image', draggable: 'false' } });
    this.selection = stage.createDiv({ cls: 'rs-crop-selection' });
    const status = this.el.createDiv({ cls: 'rs-crop-status', attr: { role: 'status' } });
    const fields = this.el.createDiv({ cls: 'rs-crop-fields' });
    for (const [key, label] of [['x', 'Left'], ['y', 'Top'], ['w', 'Width'], ['h', 'Height']] as const) {
      const wrap = fields.createEl('label', { text: `${label} %` });
      const input = wrap.createEl('input', { type: 'number', attr: { 'aria-label': `${label} percent`, min: '0', max: '100', step: '0.1' } });
      this.inputs.set(key, input);
      this.registerDomEvent(input, 'change', () => {
        this.crop = validCrop({ ...this.crop, [key]: Number(input.value) / 100 }); this.draw();
      });
    }
    const actions = this.el.createDiv({ cls: 'rs-dialog-actions' });
    const reset = actions.createEl('button', { text: 'Use full image' });
    const cancel = actions.createEl('button', { text: 'Cancel' });
    const confirm = actions.createEl('button', { text: 'Use selection', cls: 'mod-cta' });
    confirm.disabled = true;
    this.registerDomEvent(reset, 'click', () => { this.crop = { ...FULL_CROP }; this.draw(); });
    this.registerDomEvent(cancel, 'click', () => this.el.close());
    this.registerDomEvent(confirm, 'click', () => {
      if (!this.image.naturalWidth || this.finished) return;
      this.commit({ ...this.crop }, this.image.naturalWidth, this.image.naturalHeight); this.el.close();
    });
    this.registerDomEvent(this.el, 'close', () => { if (!this.finished) { this.finished = true; this.closed(); } });
    this.registerDomEvent(stage, 'pointerdown', event => {
      if (event.button !== 0 || !this.image.naturalWidth) return;
      event.preventDefault(); this.cleanup?.();
      const rect = this.image.getBoundingClientRect();
      const point = (e: PointerEvent) => ({ x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) });
      const start = point(event);
      const move = (e: PointerEvent) => {
        const end = point(e);
        this.crop = validCrop({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), w: Math.abs(end.x - start.x), h: Math.abs(end.y - start.y) }); this.draw();
      };
      const end = () => this.cleanup?.();
      this.cleanup = () => { doc.removeEventListener('pointermove', move, true); doc.removeEventListener('pointerup', end, true); doc.removeEventListener('pointercancel', end, true); this.cleanup = null; };
      doc.addEventListener('pointermove', move, true); doc.addEventListener('pointerup', end, true); doc.addEventListener('pointercancel', end, true);
    });
    this.registerDomEvent(this.image, 'load', () => { confirm.disabled = false; status.textContent = ''; this.draw(); });
    this.registerDomEvent(this.image, 'error', () => { confirm.disabled = true; status.textContent = 'Image unavailable. Close this dialog and retry the reference.'; });
    this.image.src = resource;
    doc.body.append(this.el); this.el.showModal(); this.draw();
  }
  private draw(): void {
    const c = this.crop;
    Object.assign(this.selection.style, { left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%` });
    for (const [key, input] of this.inputs) input.value = String(Math.round(c[key] * 1000) / 10);
  }
  onunload(): void { this.finished = true; this.cleanup?.(); if (this.el.open) this.el.close(); this.el.remove(); }
}
