# Contributing

Use Node.js 22 or later and `npm ci`. Run `npm run check` before proposing changes.
Do not commit `node_modules`, generated `main.js`, temporary vaults, personal notes,
or screenshots containing private content.

## Product constraints

- Keep multiple pins in memory, associated with their source note. Keep ordinary placement per leaf and cross-note placement per window.
- Reconcile membership using **all** Markdown leaves, including deferred leaves.
- Never use an active-tab event as proof that a note was closed.
- Never modify note contents or frontmatter for a Shelf action.
- No network requests, analytics, remote image loading or hidden persistence.
- Put rendering integrations behind `ReferenceAdapter`.
- Keep window integration in `src/reference-canvas.ts`; do not resize, reparent or restyle the editor.
- Blank canvas must pass input through. Do not restrict placement to a leaf, page margin or centered layout.
- Crop stores normalized view coordinates only. Never export new files or modify original images.
- Test readable source regions beside full-height explanations, not just whether Pin/Resize controls work.
- Test changes in a disposable, isolated Obsidian profile, not a personal vault.
- Keep references frameless. Controls float over the image and collapsed references are corner-anchored circles, not title bars.
- Test normal motion separately from reduced-motion functional regression. Verify intermediate frames, quick reversal, keyboard focus and interruption cleanup, not only the final DOM.

## Verification

`npm test` covers state and source parsing. `npm run test:live` launches the installed
Obsidian Desktop app with a fresh temporary profile and test vault, using Playwright
CDP for real mouse, keyboard and DOM assertions. It must never attach to your normal
Obsidian profile. The default launch helper targets macOS; set `OBSIDIAN_EXECUTABLE`
and `OBSIDIAN_ASAR` for another installation. Cross-platform harness work needs separate
validation. The helper copies an already installed app archive; it does not download
or upgrade Obsidian. Test outputs go in ignored `test-results/`.

For a real compositor-frame demo, install FFmpeg and run `RS_RECORD_MOTION=1 npm run test:live`.
Recording is optional; the motion assertions always run, including when FFmpeg is absent.

Before release, test your target Obsidian version, a third-party theme, different
window sizes and OS-specific drag behavior. Do not equate unit tests with real-host
compatibility. No GitHub publication, release upload or community-store submission
is performed by the scripts.
