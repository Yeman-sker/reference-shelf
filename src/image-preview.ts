import { Component } from 'obsidian';

export class ImagePreview extends Component {
  readonly el: HTMLDialogElement;
  private disposed = false;
  constructor(doc: Document, resource: string, path: string, close: () => void) {
    super(); this.el = doc.createElement('dialog'); this.el.className = 'rs-preview-dialog';
    this.el.setAttribute('aria-label', 'Full reference image');
    this.el.createEl('p', { text: path, cls: 'rs-muted' });
    const image = this.el.createEl('img', { attr: { src: resource, alt: path } });
    this.registerDomEvent(image, 'error', () => { image.replaceWith(doc.createTextNode('Image unavailable')); });
    const button = this.el.createEl('button', { text: 'Close full image' });
    this.registerDomEvent(button, 'click', () => this.el.close());
    this.registerDomEvent(this.el, 'close', () => { if (!this.disposed) close(); });
    doc.body.append(this.el); this.el.showModal();
  }
  onunload(): void { this.disposed = true; if (this.el.open) this.el.close(); this.el.remove(); }
}
