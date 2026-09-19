import { Component, MarkdownView, Menu, Notice, Plugin, TFile, type WorkspaceLeaf } from 'obsidian';
import { ImageAdapter } from './image-adapter';
import { ReferenceCanvas } from './reference-canvas';
import { CropEditor } from './crop-editor';
import { ImagePreview } from './image-preview';
import { FULL_CROP, ShelfStore, type Crop, type ImageSource, type Pin, type Placement } from './state';

interface PendingPin { leaf: WorkspaceLeaf; note: string; draft: Pin; doc: Document; dragging: boolean }
interface WindowContext { listeners: Component; canvas: ReferenceCanvas; active: WorkspaceLeaf | null; win: Window | null }

export default class ReferenceShelfPlugin extends Plugin {
  readonly store = new ShelfStore();
  private adapter!: ImageAdapter;
  private readonly ids = new WeakMap<WorkspaceLeaf, string>();
  private serial = 0;
  private readonly windows = new Map<Document, WindowContext>();
  private pending: PendingPin | null = null;
  private alive = true;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private menu: Menu | null = null;
  private dialog: CropEditor | ImagePreview | null = null;

  onload(): void {
    this.alive = true; this.adapter = new ImageAdapter(this.app);
    const ws = this.app.workspace;
    this.registerEvent(ws.on('layout-change', () => this.schedule()));
    this.registerEvent(ws.on('file-open', () => this.schedule()));
    this.registerEvent(ws.on('active-leaf-change', leaf => {
      if (leaf) {
        const context = this.bindDocument(leaf.view.containerEl.ownerDocument);
        // Sidebar tools do not replace the window's active reading context.
        if (!['file-explorer', 'search', 'backlink', 'outgoing-link', 'outline', 'bookmarks', 'tag'].includes(leaf.view.getViewType())) context.active = leaf;
      }
      this.schedule();
    }));
    this.registerEvent(ws.on('window-open', (_root, win) => this.bindDocument(win.document)));
    this.registerEvent(ws.on('window-close', (_root, win) => {
      for (const [doc, context] of this.windows) if (context.win === win) this.closeWindow(doc);
      this.schedule();
    }));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => { this.store.rename(oldPath, file.path); this.cancelPlacement(); this.closeDialog(); this.sync(); }));
    const refresh = (file: { path: string }) => {
      if ([...this.store.pins.values()].some(pin => pin.source.path === file.path)) this.sync(true);
    };
    this.registerEvent(this.app.vault.on('delete', refresh));
    this.registerEvent(this.app.vault.on('create', refresh));
    this.registerEvent(this.app.vault.on('modify', refresh));
    this.addCommand({ id: 'toggle-references', name: 'Show / hide all references in this window', hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'y' }], callback: () => this.activeCanvas()?.toggle() });
    this.addCommand({ id: 'unpin', name: 'Remove all references from current note', checkCallback: checking => {
      const note = ws.getActiveViewOfType(MarkdownView)?.file?.path;
      const pins = [...this.store.pins.values()].filter(pin => pin.note === note);
      if (!note || !pins.length) return false;
      if (!checking) { for (const pin of pins) this.store.remove(pin.id); this.sync(); }
      return true;
    } });
    this.addRibbonIcon('images', 'Show / hide references', () => this.activeCanvas()?.toggle());
    ws.onLayoutReady(() => {
      if (!this.alive) return;
      const context = this.bindDocument(document); context.active = ws.activeLeaf; this.sync();
    });
  }
  private activeCanvas(): ReferenceCanvas | undefined {
    const doc = this.app.workspace.activeLeaf?.view.containerEl.ownerDocument ?? document;
    return this.windows.get(doc)?.canvas;
  }
  private id(leaf: WorkspaceLeaf): string {
    let id = this.ids.get(leaf); if (!id) { id = String(++this.serial); this.ids.set(leaf, id); } return id;
  }
  private schedule(): void {
    if (!this.alive || this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; if (this.alive) this.sync(); }, 0);
  }
  private sync(force = false): void {
    for (const [doc, context] of this.windows) if (context.win?.closed) this.closeWindow(doc);
    const leaves = this.app.workspace.getLeavesOfType('markdown').filter(leaf => !leaf.view.containerEl.ownerDocument.defaultView?.closed);
    const open = new Map<string, string>();
    for (const leaf of leaves) {
      const path = leaf.view instanceof MarkdownView ? leaf.view.file?.path : leaf.getViewState().state?.file;
      if (typeof path === 'string') open.set(this.id(leaf), path);
      this.bindDocument(leaf.view.containerEl.ownerDocument);
    }
    this.store.reconcile(open);
    for (const [doc, context] of this.windows) {
      if (!context.active || !context.active.view.containerEl.isConnected || context.active.view.containerEl.ownerDocument !== doc) {
        const active = this.app.workspace.activeLeaf;
        context.active = active?.view.containerEl.ownerDocument === doc ? active
          : leaves.find(leaf => leaf.view.containerEl.ownerDocument === doc && leaf.view.containerEl.offsetWidth > 0) ?? null;
      }
      const active = context.active;
      const note = active && leaves.includes(active) && active.view instanceof MarkdownView ? active.view.file?.path ?? null : null;
      context.canvas.render(note, note && active ? this.id(active) : null, force);
    }
    if (this.pending && (!leaves.includes(this.pending.leaf) || this.pending.leaf.view instanceof MarkdownView && this.pending.leaf.view.file?.path !== this.pending.note)) this.cancelPlacement();
  }
  private actions(doc: Document, pin: Pin, placement: Placement) {
    return {
      remove: () => { this.store.remove(pin.id); this.sync(); },
      front: () => this.store.front(placement),
      crop: () => this.editCrop(doc, pin.source, pin.crop, (crop, width, height) => {
        if (!this.store.pins.has(pin.id)) return;
        pin.crop = crop; pin.imageWidth = width; pin.imageHeight = height; this.sync();
      }),
      resetCrop: () => { pin.crop = { ...FULL_CROP }; this.sync(); },
      duplicate: () => {
        const copy = this.store.add(pin.note, pin.source, pin.imageWidth, pin.imageHeight, pin.crop);
        copy.global = pin.global;
        const context = this.windows.get(doc); if (!context) return;
        const tab = context.active ? this.id(context.active) : null;
        this.store.layout(copy, tab, context.canvas.id, { ...placement, x: placement.x + 24, y: placement.y + 24, collapsed: false });
        this.sync();
      },
      preview: () => {
        const resource = this.adapter.resource(pin.source); if (!resource) { new Notice('Reference image is missing.'); return; }
        this.closeDialog(); const dialog = new ImagePreview(doc, resource, pin.source.path, () => this.closeDialog());
        this.dialog = dialog; this.addChild(dialog);
      },
      toggleGlobal: () => {
        const context = this.windows.get(doc); if (!context) return;
        this.store.setGlobal(pin.id, !pin.global, context.canvas.id, placement); this.sync();
      }
    };
  }
  private closeDialog(): void { const dialog = this.dialog; this.dialog = null; if (dialog) this.removeChild(dialog); }
  private editCrop(doc: Document, source: ImageSource, initial: Crop, commit: (crop: Crop, width: number, height: number) => void): void {
    const resource = this.adapter.resource(source); if (!resource) { new Notice('Reference image is missing.'); return; }
    this.cancelPlacement(); this.closeDialog();
    const dialog = new CropEditor(doc, resource, initial, commit, () => this.closeDialog());
    this.dialog = dialog; this.addChild(dialog);
  }
  private context(target: EventTarget | null): { leaf: WorkspaceLeaf; view: MarkdownView; image: HTMLImageElement } | null {
    if (!target || !('nodeType' in target) || target.nodeType !== 1) return null;
    const element = target as Element, image = element.closest('img') as HTMLImageElement | null;
    if (!image) return null;
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      if (leaf.view instanceof MarkdownView && leaf.view.file && leaf.view.contentEl.contains(image)) return { leaf, view: leaf.view, image };
    }
    return null;
  }
  private begin(leaf: WorkspaceLeaf, source: ImageSource, width: number, height: number, crop: Crop, dragging: boolean, x: number, y: number): void {
    this.cancelPlacement(); if (!(leaf.view instanceof MarkdownView) || !leaf.view.file) return;
    const doc = leaf.view.containerEl.ownerDocument, note = leaf.view.file.path;
    this.app.workspace.setActiveLeaf(leaf, { focus: false });
    const context = this.bindDocument(doc); context.active = leaf;
    const draft: Pin = { id: 'draft', note, source, crop: { ...crop }, imageWidth: width || 800, imageHeight: height || 500, global: false };
    this.pending = { leaf, note, draft, doc, dragging }; context.canvas.preview(draft, x, y);
  }
  private place(event: MouseEvent): void {
    const pending = this.pending; if (!pending) return;
    this.sync(); if (this.pending !== pending) return;
    const context = this.windows.get(pending.doc); if (!context) return;
    const pin = this.store.add(pending.note, pending.draft.source, pending.draft.imageWidth, pending.draft.imageHeight, pending.draft.crop);
    const placement = context.canvas.position(pin, event.clientX, event.clientY);
    this.store.layout(pin, this.id(pending.leaf), context.canvas.id, placement);
    this.cancelPlacement(); this.sync();
    context.canvas.cards.get(pin.id)?.land();
  }
  private cancelPlacement(): void {
    if (this.pending) this.windows.get(this.pending.doc)?.canvas.stopPreview();
    this.pending = null;
  }
  private closeWindow(doc: Document): void {
    const context = this.windows.get(doc); if (!context) return;
    if (this.pending?.doc === doc) this.cancelPlacement();
    if (this.dialog?.el.ownerDocument === doc) this.closeDialog();
    this.windows.delete(doc); this.store.globalPlacements.delete(context.canvas.id);
    this.removeChild(context.listeners); this.removeChild(context.canvas);
  }
  private bindDocument(doc: Document): WindowContext {
    const existing = this.windows.get(doc); if (existing) return existing;
    const listeners = new Component(); this.addChild(listeners);
    const canvas = new ReferenceCanvas(doc, `window-${++this.serial}`, this.store, this.adapter, (pin, placement) => this.actions(doc, pin, placement));
    this.addChild(canvas);
    const context: WindowContext = { listeners, canvas, active: null, win: doc.defaultView }; this.windows.set(doc, context);
    if (doc.defaultView) listeners.registerDomEvent(doc.defaultView, 'unload', () => { this.closeWindow(doc); this.schedule(); });
    listeners.registerDomEvent(doc, 'contextmenu', event => {
      const source = this.context(event.target); if (!source?.view.file) return;
      const image = this.adapter.resolveElement(source.image, source.view.file.path); if (!image) return;
      event.preventDefault(); event.stopPropagation(); this.menu?.hide();
      const menu = new Menu().setUseNativeMenu(false); this.menu = menu;
      menu.addItem(item => item.setTitle('Pin image on canvas').setIcon('pin').onClick(() => this.begin(source.leaf, image, source.image.naturalWidth, source.image.naturalHeight, FULL_CROP, false, event.clientX, event.clientY)));
      menu.addItem(item => item.setTitle('Crop and pin').setIcon('crop').onClick(() => {
        this.app.workspace.setActiveLeaf(source.leaf, { focus: false });
        const note = source.view.file?.path;
        this.editCrop(doc, image, FULL_CROP, (crop, width, height) => {
          if (source.view.file?.path === note) this.begin(source.leaf, image, width, height, crop, false, event.clientX, event.clientY);
        });
      }));
      menu.addSeparator();
      menu.addItem(item => item.setTitle('Open image in new tab').setIcon('image').onClick(() => {
        const file = this.app.vault.getAbstractFileByPath(image.path); if (file instanceof TFile) void this.app.workspace.getLeaf('tab').openFile(file);
      }));
      menu.onHide(() => { if (this.menu === menu) this.menu = null; }); menu.showAtMouseEvent(event);
    }, true);
    listeners.registerDomEvent(doc, 'dragstart', event => {
      const source = this.context(event.target); if (!source?.view.file) return;
      const image = this.adapter.resolveElement(source.image, source.view.file.path); if (!image) return;
      const dragImage = doc.createElement('canvas'); dragImage.width = dragImage.height = 1;
      event.dataTransfer?.setDragImage(dragImage, 0, 0);
      this.begin(source.leaf, image, source.image.naturalWidth, source.image.naturalHeight, FULL_CROP, true, event.clientX, event.clientY);
    }, true);
    listeners.registerDomEvent(doc, 'dragover', event => {
      if (!this.pending?.dragging || this.pending.doc !== doc) return;
      event.preventDefault(); event.stopPropagation(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      canvas.preview(this.pending.draft, event.clientX, event.clientY);
    }, true);
    listeners.registerDomEvent(doc, 'drop', event => {
      if (!this.pending?.dragging || this.pending.doc !== doc) return;
      event.preventDefault(); event.stopImmediatePropagation(); this.place(event);
    }, true);
    listeners.registerDomEvent(doc, 'pointermove', event => {
      if (this.pending && !this.pending.dragging && this.pending.doc === doc) canvas.preview(this.pending.draft, event.clientX, event.clientY);
    }, true);
    listeners.registerDomEvent(doc, 'pointerdown', event => {
      if (!this.pending || this.pending.dragging || this.pending.doc !== doc || event.button !== 0) return;
      event.preventDefault(); event.stopImmediatePropagation(); this.place(event);
    }, true);
    listeners.registerDomEvent(doc, 'dragend', () => { if (this.pending?.dragging) this.cancelPlacement(); }, true);
    listeners.registerDomEvent(doc, 'keydown', event => {
      if (event.key === 'Escape' && this.pending) { event.preventDefault(); event.stopPropagation(); this.cancelPlacement(); }
    }, true);
    return context;
  }
  onunload(): void {
    this.alive = false; if (this.timer) clearTimeout(this.timer);
    this.menu?.hide(); this.cancelPlacement(); this.closeDialog();
    for (const context of this.windows.values()) { this.removeChild(context.canvas); this.removeChild(context.listeners); }
    this.windows.clear(); this.store.clear();
  }
}
