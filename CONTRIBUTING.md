# Contributing

Use Node.js 22 or later and `npm ci`. Run `npm run check` before proposing changes.
Do not commit `node_modules`, generated `main.js`, temporary vaults, personal notes,
or screenshots containing private content.

## Product constraints

- Keep pins in memory, keyed by note path. Keep display state per leaf.
- Reconcile membership using **all** Markdown leaves, including deferred leaves.
- Never use an active-tab event as proof that a note was closed.
- Never modify note contents or frontmatter for a Shelf action.
- No network requests, analytics, remote image loading or hidden persistence.
- Put rendering integrations behind `ReferenceAdapter`.
- Keep layout integration in `src/shelf.ts`; do not reparent the editor.
- Test changes in a disposable, isolated Obsidian profile, not a personal vault.

## Verification

`npm test` covers state and source parsing. `npm run test:live` launches the installed
Obsidian Desktop app with a fresh temporary profile and test vault, using Playwright
CDP for real mouse, keyboard and DOM assertions. It must never attach to your normal
Obsidian profile. The default launch helper targets macOS; set `OBSIDIAN_EXECUTABLE`
and `OBSIDIAN_ASAR` for another installation. Cross-platform harness work needs separate
validation. The helper copies an already installed app archive; it does not download
or upgrade Obsidian. Test outputs go in ignored `test-results/`.

Before release, test your target Obsidian version, a third-party theme, different
window sizes and OS-specific drag behavior. Do not equate unit tests with real-host
compatibility. No GitHub publication, release upload or community-store submission
is performed by the scripts.
