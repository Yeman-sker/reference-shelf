# Changelog

## 0.2.0 — reference canvas

- Replace the single top shelf with a transparent full-window layer, including sidebar and split-pane regions. Leave the native title strip untouched.
- Multiple independent pins, including multiple crops of one source image; no derivative images or Markdown edits.
- Free placement with a live preview; move handles, four-corner proportional resize, keyboard adjustments, collapse, front ordering and edge snapping.
- Redraw or numerically adjust crop, restore full image, duplicate a reference, and open a temporary full-image preview.
- Ordinary pins follow the active note. Explicit “Keep across notes” references survive source-tab closure; their geometry is independent in each window.
- Per-tab ordinary layouts, popout-window canvases, close cleanup, and a configurable Mod+Shift+Y hide/show command.
- Extreme tall images keep a usable toolbar rather than shrinking the controls away.
- No session persistence. The former saved shelf-height setting is ignored; existing data.json is left untouched.
- Updated pure-state tests and real-host acceptance tests, including the two-crop reading task, input pass-through, native drag, source hashes and popouts.

## 0.1.0 — local MVP

- Local PNG / JPG / JPEG / WEBP / SVG image pins in Reading View and Live Preview.
- Context menu and same-leaf drag-to-top interactions.
- A non-overlay top shelf with contain rendering, height divider, collapse and unpin.
- Shared reference per note; independent display state per tab.
- Rename, delete, retry and last-tab-close lifecycle handling.
- Persist only the last manually chosen height; never persist pins or edit Markdown.
- Unit tests, isolated real-Obsidian UI tests and verified local ZIP packaging.

No packaged GitHub Release yet. Remote images, Excalidraw, zoom/pan and cross-restart pins are outside
this release. Broader theme and Windows/Linux compatibility have not been certified.
