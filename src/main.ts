import { Component, MarkdownView, Menu, Plugin, TFile, type WorkspaceLeaf } from 'obsidian';
import { ImageAdapter } from './image-adapter';
import { Shelf } from './shelf';
import { ShelfStore, type ImageSource } from './state';

export default class ReferenceShelfPlugin extends Plugin {
  readonly store = new ShelfStore();
  private adapter!: ImageAdapter;
  private readonly ids = new WeakMap<WorkspaceLeaf, string>();
  private serial = 0;
  private readonly shelves = new Map<string, Shelf>();
  private readonly boundDocs = new Map<Document, Component>();
  private drag: { leaf: WorkspaceLeaf; note: string; source: ImageSource; zone: HTMLElement } | null = null;
  private alive = true;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private menu: Menu | null = null;
  private saveQueue: Promise<void> = Promise.resolve();

  async onload(): Promise<void> {
    this.alive = true;
    this.adapter = new ImageAdapter(this.app);
    const prefs: unknown = await this.loadData();
    if (prefs && typeof prefs === 'object' && 'lastHeight' in prefs && typeof prefs.lastHeight === 'number' && Number.isFinite(prefs.lastHeight)) {
      this.store.lastHeight = Math.max(0, Math.min(3000, prefs.lastHeight));
    }
    const workspace = this.app.workspace;
    this.registerEvent(workspace.on('layout-change', () => this.schedule()));
    this.registerEvent(workspace.on('active-leaf-change', () => this.schedule()));
    this.registerEvent(workspace.on('file-open', () => this.schedule()));
    this.registerEvent(workspace.on('window-open', (_win, win) => this.bindDocument(win.document)));
    this.registerEvent(workspace.on('window-close', (_win, win) => {
      const listeners = this.boundDocs.get(win.document);
      if (listeners) this.removeChild(listeners);
      this.boundDocs.delete(win.document);
      this.schedule();
    }));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => { this.store.rename(oldPath, file.path); this.sync(); }));
    const refresh = (file: { path: string }) => {
      if ([...this.store.pins.values()].some(source => source.path === file.path)) this.sync(true);
    };
    this.registerEvent(this.app.vault.on('delete', refresh));
    this.registerEvent(this.app.vault.on('create', refresh));
    this.registerEvent(this.app.vault.on('modify', refresh));
    this.addCommand({ id: 'unpin', name: 'Unpin image from current note', checkCallback: checking => {
      const note = workspace.getActiveViewOfType(MarkdownView)?.file?.path;
      if (!note || !this.store.pins.has(note)) return false;
      if (!checking) { this.store.unpin(note); this.sync(); }
      return true;
    } });
    workspace.onLayoutReady(() => { if (this.alive) { this.bindDocument(document); this.sync(); } });
  }
  private id(leaf: WorkspaceLeaf): string {
    let value = this.ids.get(leaf);
    if (!value) { value = String(++this.serial); this.ids.set(leaf, value); }
    return value;
  }
  private schedule(): void {
    if (!this.alive || this.timer) return;
    // Defer one event batch: moving a tab may briefly detach and reattach it.
    this.timer = setTimeout(() => { this.timer = null; if (this.alive) this.sync(); }, 0);
  }
  private sync(force = false): void {
    const leaves = this.app.workspace.getLeavesOfType('markdown');
    const open = new Map<string, string>();
    for (const leaf of leaves) {
      const state = leaf.getViewState().state;
      const path = leaf.view instanceof MarkdownView ? leaf.view.file?.path : state?.file;
      if (typeof path === 'string') open.set(this.id(leaf), path);
    }
    this.store.reconcile(open);
    const visible = new Set<string>();
    for (const leaf of leaves) {
      if (!(leaf.view instanceof MarkdownView) || !leaf.view.file) continue;
      const id = this.id(leaf);
      const tab = this.store.tabs.get(id);
      const source = tab && this.store.pins.get(tab.note);
      this.bindDocument(leaf.view.containerEl.ownerDocument);
      if (!tab || !source) continue;
      visible.add(id);
      let shelf = this.shelves.get(id);
      // View objects and tab state can change when a leaf navigates.
      if (shelf && (shelf.view !== leaf.view || shelf.el.dataset.note !== tab.note)) {
        this.removeChild(shelf); this.shelves.delete(id); shelf = undefined;
      }
      if (!shelf) {
        shelf = new Shelf(leaf.view, tab, this.adapter, {
          unpin: () => { this.store.unpin(tab.note); this.sync(); },
          saveHeight: height => {
            this.store.lastHeight = height;
            this.saveQueue = this.saveQueue.catch(() => {}).then(() => this.saveData({ lastHeight: height })).catch(error => console.error('Reference Shelf: unable to save height', error));
          }
        });
        shelf.el.dataset.note = tab.note;
        this.addChild(shelf);
        this.shelves.set(id, shelf);
      }
      shelf.update(source, force);
    }
    for (const [id, shelf] of this.shelves) if (!visible.has(id)) {
      this.removeChild(shelf); this.shelves.delete(id);
    }
    if (this.drag && (!leaves.includes(this.drag.leaf) || this.drag.leaf.view instanceof MarkdownView && this.drag.leaf.view.file?.path !== this.drag.note)) this.endDrag();
  }
  private pin(leaf: WorkspaceLeaf, source: ImageSource, expectedNote: string): void {
    if (!(leaf.view instanceof MarkdownView) || leaf.view.file?.path !== expectedNote) return;
    this.sync();
    this.store.pin(expectedNote, source);
    const tab = this.store.tabs.get(this.id(leaf));
    if (tab) tab.collapsed = false;
    this.sync();
  }
  private context(target: EventTarget | null): { leaf: WorkspaceLeaf; view: MarkdownView; element: Element } | null {
    // Duck-type to support elements from a popout window's realm.
    if (!target || !('nodeType' in target) || target.nodeType !== 1) return null;
    const element = target as Element;
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      if (leaf.view instanceof MarkdownView && leaf.view.file && leaf.view.contentEl.contains(element)) return { leaf, view: leaf.view, element };
    }
    return null;
  }
  private bindDocument(doc: Document): void {
    if (this.boundDocs.has(doc)) return;
    const listeners = new Component();
    this.addChild(listeners);
    this.boundDocs.set(doc, listeners);
    listeners.registerDomEvent(doc, 'contextmenu', event => {
      const context = this.context(event.target);
      if (!context?.view.file) return;
      const note = context.view.file.path;
      const source = this.adapter.resolveElement(context.element, note);
      if (!source) return;
      event.preventDefault(); event.stopPropagation();
      this.menu?.hide();
      const menu = new Menu().setUseNativeMenu(false);
      this.menu = menu;
      menu.addItem(item => item.setTitle('Pin to Reference Shelf').setIcon('pin').onClick(() => this.pin(context.leaf, source, note)));
      menu.addItem(item => item.setTitle('Open image in new tab').setIcon('image').onClick(() => {
        const file = this.app.vault.getAbstractFileByPath(source.path);
        if (file instanceof TFile) void this.app.workspace.getLeaf('tab').openFile(file);
      }));
      menu.onHide(() => { if (this.menu === menu) this.menu = null; });
      menu.showAtMouseEvent(event);
    }, true);
    listeners.registerDomEvent(doc, 'dragstart', event => {
      this.endDrag();
      const context = this.context(event.target);
      if (!context?.view.file) return;
      const source = this.adapter.resolveElement(context.element, context.view.file.path);
      if (!source) return;
      const zone = doc.createElement('div');
      zone.className = 'reference-shelf-drop-zone';
      zone.textContent = 'Pin as Reference';
      zone.setAttribute('role', 'status');
      context.view.containerEl.insertBefore(zone, context.view.contentEl);
      this.drag = { leaf: context.leaf, note: context.view.file.path, source, zone };
      // No source data rewrites: native editor DnD outside our zone still works.
    }, true);
    listeners.registerDomEvent(doc, 'dragover', event => {
      if (!this.drag) return;
      const over = event.composedPath().includes(this.drag.zone);
      this.drag.zone.classList.toggle('is-over', over);
      if (over) { event.preventDefault(); event.stopPropagation(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; }
    }, true);
    listeners.registerDomEvent(doc, 'drop', event => {
      const drag = this.drag;
      if (!drag) return;
      if (event.composedPath().includes(drag.zone)) {
        event.preventDefault(); event.stopPropagation();
        this.pin(drag.leaf, drag.source, drag.note);
      }
      this.endDrag();
    }, true);
    listeners.registerDomEvent(doc, 'dragend', () => this.endDrag(), true);
    listeners.registerDomEvent(doc, 'keydown', event => { if (event.key === 'Escape') this.endDrag(); }, true);
  }
  private endDrag(): void { this.drag?.zone.remove(); this.drag = null; }
  onunload(): void {
    this.alive = false;
    if (this.timer) clearTimeout(this.timer);
    this.menu?.hide();
    this.endDrag();
    for (const shelf of this.shelves.values()) this.removeChild(shelf);
    this.shelves.clear(); this.boundDocs.clear(); this.store.clear();
  }
}
