# Changelog

## 0.3.1 — drag and resize performance

- Replace expensive box-shadow interpolation with a fixed separate shadow fading via opacity. Retain the hover controls and drag background effect.
- Coalesce pointer updates into one requestAnimationFrame callback, cache bounds for the gesture, and translate moving pins without rewriting layout geometry. Flush the final pointer update on release and cancel scheduled work on interruption.
- Replace discontinuous dominant-axis resize with continuous aspect-diagonal projection, opposite-corner anchoring and immediate boundary reversal. Stop resizing without a scale bounce.
- Take over running expansion/landing geometry when grabbing an expanded pin; keep magnetic feedback for snapped movement only.
- Add four-corner resize regression tests and an unrecorded repeated performance gate at two viewport sizes. Measure renderer frame gaps and DOM bounds reads separately from recorded demonstrations.

## 0.3.0 — frameless interaction

- Remove the title strip and dedicated move handle. Drag the image itself with a small intent threshold; keep four-corner resize and keyboard movement.
- Fade and lift a compact floating toolbar into the outward upper corner. Keep its side stable during a drag, with a small centre hysteresis after release.
- Fold to a 44px circular image button at the same corner, with bounded jelly motion. Restore image size and crop on expansion; allow moving the folded button without accidentally expanding it.
- Add layered soft shadows, a subtle drag-only background scrim, edge-placement hints and magnetic landing feedback. Never filter or resize the editor DOM.
- Respect reduced-motion preferences, including changes during animation. Reverse in-flight folds from their current geometry, radius and opacity; clean up on Escape, hide, window resize and unload.
- Preserve keyboard focus through folding. Keep reference names accessible without Obsidian's large-card hover tooltip.
- Add pure geometry/motion tests and real-host hover, animation-frame, orb-drag, interruption and accessibility checks. Optional compositor-frame recording produces a real interaction video.

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
