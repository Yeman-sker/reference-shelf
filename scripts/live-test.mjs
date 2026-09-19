import { expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { setup } from './live-setup.mjs';
import { launch } from './live-launch.mjs';
import { motionChecks } from './live-motion.mjs';

const fixture = await setup();
const { version } = JSON.parse(await readFile('manifest.json', 'utf8'));
console.log('Isolated vault:', fixture.vault);
const app = await launch(fixture.profile), page = app.page;
const checks = [], errors = []; let hostArchive = '';
page.on('pageerror', error => errors.push(error.message));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const originalImage = hash(await readFile(path.join(fixture.vault, 'composite.svg')));
const cards = page.locator('.rs-pin');
const sourceImage = name => page.locator(`.workspace-leaf.mod-active .view-content img[src*="${name}"]:visible`).first();
const scroller = () => page.locator('.workspace-leaf.mod-active .markdown-preview-view');
const card = id => page.locator(`.rs-pin[data-pin-id="${id}"]`);
const ids = () => cards.evaluateAll(elements => elements.map(el => el.dataset.pinId));
async function check(name, run) { await run(); checks.push(name); console.log('PASS', name); }
async function open(file, newLeaf = false, mode = 'preview') {
  return page.evaluate(async ({ file, newLeaf, mode }) => {
    const leaf = app.workspace.getLeaf(newLeaf ? 'tab' : false); await leaf.openFile(app.vault.getAbstractFileByPath(file));
    await leaf.setViewState({ type: 'markdown', state: { file, mode, source: false } }); app.workspace.setActiveLeaf(leaf, { focus: true }); return leaf.id;
  }, { file, newLeaf, mode });
}
async function menuImage(name, action) { await sourceImage(name).click({ button: 'right' }); await page.getByText(action, { exact: true }).click(); }
async function place(x, y) { await expect(page.locator('.rs-placement-preview')).toBeVisible(); await page.mouse.click(x, y); await expect(page.locator('.rs-placement-preview')).toHaveCount(0); }
async function pin(name, x, y) { await menuImage(name, 'Pin image on canvas'); await place(x, y); }
async function action(id, name) { await card(id).hover(); await card(id).getByRole('button', { name: 'Reference actions', exact: true }).click(); await page.getByText(name, { exact: true }).click(); }
async function cropRegion(x, y, w, h) {
  const dialog = page.getByRole('dialog', { name: 'Crop reference', exact: true });
  await expect(dialog).toBeVisible(); const img = dialog.locator('.rs-crop-stage > img');
  await expect(img).toHaveJSProperty('naturalWidth', 1000); const b = await img.boundingBox();
  await page.mouse.move(b.x + b.width * x, b.y + b.height * y); await page.mouse.down();
  await page.mouse.move(b.x + b.width * (x + w), b.y + b.height * (y + h), { steps: 12 }); await page.mouse.up();
  await dialog.getByRole('button', { name: 'Use selection', exact: true }).click(); await expect(dialog).toHaveCount(0);
}
async function movePin(id, x, y) {
  const b = await card(id).boundingBox();
  await page.mouse.move(b.x + 24, b.y + 80); await page.mouse.down();
  await page.mouse.move(x, y, { steps: 12 }); await page.mouse.up();
}
async function resizePin(id, dx) {
  await card(id).hover(); const b = await card(id).getByRole('button', { name: 'Resize reference se', exact: true }).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dx, { steps: 12 }); await page.mouse.up();
}
try {
  await page.waitForFunction(() => !!window.app?.workspace?.layoutReady);
  const trust = page.getByRole('button', { name: /信任仓库作者并启用插件|Trust author and enable plugins/ });
  if (await trust.count()) await trust.click();
  await page.waitForFunction(() => !!app.plugins.plugins['reference-shelf']);
  // Trust opens Settings in a second native window in Obsidian 1.13.
  // Close it; otherwise the host routes even main-page keys into that modal scope.
  await page.evaluate(() => app.setting.close()); await page.bringToFront();
  await page.waitForFunction(() => activeWindow.document === document);
  await page.setViewportSize({ width: 1500, height: 950 });
  // Functional regression is deterministic; separate motion checks use real animation.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { app.workspace.leftSplit.collapse(); app.workspace.rightSplit.collapse(); document.body.style.setProperty('--file-line-width', '660px'); });
  await open('A.md');
  hostArchive = app.logs().match(/Loading updated app package ([^\n]+)/)?.[1] ?? '';
  expect(hostArchive).toContain(path.basename(process.env.OBSIDIAN_ASAR ?? 'obsidian-1.13.7.asar'));
  await expect.poll(() => scroller().evaluate(el => Math.round(el.getBoundingClientRect().x))).toBe(44);
  const initialRect = await scroller().boundingBox();
  const initialFiles = await page.evaluate(() => app.vault.getFiles().map(f => f.path).sort());
  let a, b;
  await check('Two independently selected regions from the same image, placed on opposite sides', async () => {
    await menuImage('composite.svg', 'Crop and pin'); await cropRegion(.03, .15, .45, .79); await place(60, 120);
    await expect(cards).toHaveCount(1); [a] = await ids();
    await menuImage('composite.svg', 'Crop and pin'); await cropRegion(.52, .15, .45, .79); await place(1160, 120);
    await expect(cards).toHaveCount(2); [, b] = await ids();
    const pins = await page.evaluate(() => [...app.plugins.plugins['reference-shelf'].store.pins.values()]);
    expect(pins[0].crop.x).toBeCloseTo(.03, 2); expect(pins[1].crop.x).toBeCloseTo(.52, 2);
    await expect(card(a).locator('img')).toHaveJSProperty('naturalWidth', 1000);
    expect((await card(b).boundingBox()).x).toBeGreaterThan(1100);
  });
  await check('No document resizing, no derivative files, no source-image or Markdown writes', async () => {
    expect(await scroller().boundingBox()).toEqual(initialRect);
    expect(await page.evaluate(() => app.vault.getFiles().map(f => f.path).sort())).toEqual(initialFiles);
    expect(hash(await readFile(path.join(fixture.vault, 'A.md')))).toBe(hash(fixture.note));
    expect(hash(await readFile(path.join(fixture.vault, 'composite.svg')))).toBe(originalImage);
  });
  await check('Full-height reading with both legible cropped references and independent scrolling', async () => {
    await resizePin(a, 40); await resizePin(b, 40);
    const beforeA = await card(a).boundingBox(), beforeB = await card(b).boundingBox();
    await scroller().evaluate(el => { el.scrollTop = el.clientHeight * 5; });
    expect(await scroller().evaluate(el => el.scrollTop)).toBeGreaterThan(2000);
    expect(await card(a).boundingBox()).toEqual(beforeA); expect(await card(b).boundingBox()).toEqual(beforeB);
    expect((await scroller().boundingBox()).height).toBe(initialRect.height);
    // Synthetic panel annotations are 23 source pixels: projected size must remain readable.
    expect(beforeA.width / 450 * 23).toBeGreaterThan(14);
    await mkdir('test-results', { recursive: true });
    await page.mouse.move(750, 880); await page.screenshot({ path: 'test-results/canvas-light.png' });
    await page.evaluate(() => { document.body.classList.remove('theme-light'); document.body.classList.add('theme-dark'); });
    await page.screenshot({ path: 'test-results/canvas-dark.png' });
    await page.evaluate(() => { document.body.classList.remove('theme-dark'); document.body.classList.add('theme-light'); });
  });
  await check('Empty canvas passes wheel scrolling and text selection through to Obsidian', async () => {
    const start = await scroller().evaluate(el => el.scrollTop);
    await page.mouse.move(750, 650); await page.mouse.wheel(0, 400);
    await expect.poll(() => scroller().evaluate(el => el.scrollTop)).toBeGreaterThan(start);
    expect(await page.evaluate(() => document.elementFromPoint(750, 600)?.closest('.rs-canvas') !== null)).toBe(false);
    const paragraph = page.locator('.workspace-leaf.mod-active .markdown-preview-view p:visible').filter({ hasText: 'Panel A approaches' });
    const visibleParagraph = await paragraph.evaluateAll(els => { const el = els.find(el => { const r = el.getBoundingClientRect(); return r.top > 150 && r.bottom < innerHeight - 60; }); const r = el?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, width: r.width } : null; });
    expect(visibleParagraph).not.toBeNull();
    await page.mouse.move(visibleParagraph.x + 5, visibleParagraph.y + 10); await page.mouse.down(); await page.mouse.move(visibleParagraph.x + 200, visibleParagraph.y + 10, { steps: 8 }); await page.mouse.up();
    expect(await page.evaluate(() => window.getSelection()?.toString().length)).toBeGreaterThan(5);
  });
  await motionChecks({ page, check, card, a, b, movePin });
  await check('Move across text and sidebar regions, overlap, front ordering, keyboard and collapse', async () => {
    const unchangedB = await card(b).boundingBox(); await movePin(a, 690, 220);
    expect((await card(a).boundingBox()).x).toBeGreaterThan(600); expect(await card(b).boundingBox()).toEqual(unchangedB);
    await resizePin(a, 160); expect((await card(a).boundingBox()).width).toBeGreaterThan(450);
    await card(a).focus(); const old = await card(a).boundingBox(); await page.keyboard.press('ArrowLeft'); expect((await card(a).boundingBox()).x).toBe(old.x - 10);
    await card(a).getByRole('button', { name: 'Collapse reference', exact: true }).click(); expect((await card(a).boundingBox()).height).toBe(44);
    await card(a).getByRole('button', { name: 'Expand reference', exact: true }).click(); expect((await card(a).boundingBox()).height).toBe(old.height);
    await page.evaluate(() => app.workspace.leftSplit.expand()); await movePin(a, 100, 190);
    expect((await card(a).boundingBox()).x).toBeLessThan(200); await page.evaluate(() => app.workspace.leftSplit.collapse());
    await movePin(a, 1180, 250); await card(b).click({ position: { x: 100, y: 20 } });
    expect(await card(b).evaluate(el => Number(el.style.zIndex))).toBeGreaterThan(await card(a).evaluate(el => Number(el.style.zIndex)));
    await movePin(a, 70, 160);
  });
  await check('Hide/show shortcut preserves all placements and releases covered text', async () => {
    const before = await card(a).boundingBox(); await page.keyboard.press('Meta+Shift+Y');
    await expect(card(a)).not.toBeVisible(); await expect(card(b)).not.toBeVisible();
    await page.keyboard.press('Meta+Shift+Y'); await expect(card(a)).toBeVisible(); expect(await card(a).boundingBox()).toEqual(before);
  });
  await check('Crop editing, full preview, restore, duplication and independent removal', async () => {
    await action(a, 'Adjust crop');
    await page.getByRole('dialog', { name: 'Crop reference' }).getByRole('button', { name: 'Cancel', exact: true }).click();
    await action(a, 'View full image'); await expect(page.getByRole('dialog', { name: 'Full reference image' }).locator('img')).toHaveJSProperty('naturalWidth', 1000);
    await page.getByRole('button', { name: 'Close full image' }).click();
    await action(a, 'Restore full image'); expect(await card(a).locator('img').evaluate(el => el.style.width)).toBe('100%');
    await action(a, 'Adjust crop'); await cropRegion(.03, .15, .45, .79);
    await action(a, 'Duplicate reference'); await expect(cards).toHaveCount(3);
    const duplicate = (await ids()).find(id => id !== a && id !== b); await card(duplicate).hover(); await card(duplicate).getByRole('button', { name: 'Unpin reference', exact: true }).click(); await expect(cards).toHaveCount(2);
  });
  await check('Cancel selection, placement and an in-progress move without changing references', async () => {
    const oldCrop = await page.evaluate(id => app.plugins.plugins['reference-shelf'].store.pins.get(id).crop, a);
    await action(a, 'Adjust crop'); await page.getByLabel('Left percent', { exact: true }).fill('25');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await page.evaluate(id => app.plugins.plugins['reference-shelf'].store.pins.get(id).crop, a)).toEqual(oldCrop);
    await scroller().evaluate(el => { el.scrollTop = 0; });
    await menuImage('composite.svg', 'Pin image on canvas'); await page.keyboard.press('Escape');
    await expect(page.locator('.rs-placement-preview')).toHaveCount(0); await expect(cards).toHaveCount(2);
    const old = await card(a).boundingBox();
    await page.mouse.move(old.x + 30, old.y + 80); await page.mouse.down(); await page.mouse.move(old.x + 110, old.y + 160, { steps: 5 });
    await page.keyboard.press('Escape'); await page.mouse.up(); expect(await card(a).boundingBox()).toEqual(old);
  });
  await check('Same-note tabs share pins and crop but keep independent geometry', async () => {
    const old = await card(a).boundingBox();
    await open('A.md', true); await expect(cards).toHaveCount(2); expect((await card(a).boundingBox()).width).toBe(280);
    await card(a).hover(); await card(a).getByRole('button', { name: 'Collapse reference', exact: true }).click();
    await page.evaluate(() => { const leaf = app.workspace.getLeavesOfType('markdown').find(l => l !== app.workspace.activeLeaf && l.view.file?.path === 'A.md'); app.workspace.setActiveLeaf(leaf, { focus: true }); });
    await expect(card(a)).not.toHaveClass(/is-collapsed/); expect(await card(a).boundingBox()).toEqual(old);
    await action(a, 'Adjust crop'); await cropRegion(.05, .17, .40, .74);
    await page.evaluate(() => { const leaf = app.workspace.getLeavesOfType('markdown').find(l => l !== app.workspace.activeLeaf && l.view.file?.path === 'A.md'); app.workspace.setActiveLeaf(leaf, { focus: true }); });
    await expect(card(a)).toHaveClass(/is-collapsed/);
    expect(await page.evaluate(id => app.plugins.plugins['reference-shelf'].store.pins.get(id).crop.x, a)).toBeCloseTo(.05, 2);
  });
  await check('Ordinary pins follow notes; explicitly global pins survive source-tab closure', async () => {
    await action(b, 'Keep across notes'); await open('B.md', true);
    await expect(cards).toHaveCount(1); await expect(card(b)).toBeVisible();
    await pin('other.svg', 500, 200); await expect(cards).toHaveCount(2);
    await page.evaluate(() => app.workspace.getLeavesOfType('markdown').filter(l => l.view.file?.path === 'A.md').forEach(l => l.detach()));
    await expect(card(b)).toBeVisible();
    await expect.poll(() => page.evaluate(id => app.plugins.plugins['reference-shelf'].store.pins.has(id), a)).toBe(false);
    await action(b, 'Follow source note'); await expect(card(b)).toHaveCount(0);
    await page.evaluate(() => app.commands.executeCommandById('reference-shelf:unpin')); await expect(cards).toHaveCount(0);
  });
  await check('Native image drag pins anywhere; Escape cancels without editing the note', async () => {
    await open('A.md', true);
    const img = sourceImage('composite.svg'); await img.scrollIntoViewIfNeeded(); const r = await img.boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.mouse.down(); await page.mouse.move(r.x + r.width / 2 + 25, r.y + r.height / 2 + 25, { steps: 5 });
    await expect(page.locator('.rs-placement-preview')).toBeVisible(); await page.mouse.move(700, 550, { steps: 12 }); await page.mouse.up();
    await expect(cards).toHaveCount(1); expect((await cards.first().boundingBox()).x).toBe(700);
    await sourceImage('wide.svg').scrollIntoViewIfNeeded(); const wide = await sourceImage('wide.svg').boundingBox();
    await page.mouse.move(wide.x + 40, wide.y + 40); await page.mouse.down(); await page.mouse.move(wide.x + 65, wide.y + 65, { steps: 5 });
    await expect(page.locator('.rs-placement-preview')).toBeVisible(); await page.keyboard.press('Escape'); await page.mouse.up();
    await expect(cards).toHaveCount(1); await expect(page.locator('.rs-placement-preview')).toHaveCount(0);
  });
  await check('Live Preview right-click, crop and drag do not insert image links', async () => {
    await page.evaluate(() => app.commands.executeCommandById('reference-shelf:unpin'));
    await open('A.md', false, 'source'); await menuImage('composite.svg', 'Crop and pin'); await cropRegion(.52, .15, .45, .79); await place(60, 140);
    await expect(cards).toHaveCount(1);
    const img = sourceImage('composite.svg'); await img.scrollIntoViewIfNeeded(); const r = await img.boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.mouse.down(); await page.mouse.move(r.x + r.width / 2 + 25, r.y + r.height / 2 + 25, { steps: 5 });
    await page.mouse.move(700, 600, { steps: 12 }); await page.mouse.up(); await expect(cards).toHaveCount(2);
    expect(await page.evaluate(() => app.workspace.activeLeaf.view.editor.getValue())).toBe(fixture.note);
    await open('A.md'); await expect(cards).toHaveCount(2);
  });
  await check('Broken images, missing sources, recreation, rename and retry', async () => {
    await page.evaluate(() => app.commands.executeCommandById('reference-shelf:unpin'));
    await pin('broken.png', 60, 120); await expect(cards.first().getByText('Image unavailable')).toBeVisible();
    await cards.first().getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(cards.first().getByText('Image unavailable')).toBeVisible();
    await cards.first().hover(); await cards.first().getByRole('button', { name: 'Unpin reference', exact: true }).click();
    await pin('other.svg', 60, 120); const [id] = await ids();
    const data = await readFile(path.join(fixture.vault, 'other.svg'), 'utf8');
    await page.evaluate(() => app.vault.delete(app.vault.getAbstractFileByPath('other.svg'))); await expect(card(id).getByText('Image unavailable')).toBeVisible();
    await page.evaluate(async data => { await app.vault.create('other.svg', data); }, data); await expect(card(id).locator('img')).toHaveJSProperty('naturalWidth', 1200);
    await page.evaluate(() => app.vault.rename(app.vault.getAbstractFileByPath('other.svg'), 'renamed.svg')); await expect(card(id).locator('img')).toHaveAttribute('src', /renamed.svg/);
    await page.evaluate(() => app.vault.rename(app.vault.getAbstractFileByPath('A.md'), 'Renamed.md')); await expect(card(id)).toHaveAttribute('data-note', 'Renamed.md');
  });
  await check('Window shrink keeps controls reachable; noncentered text keeps its geometry', async () => {
    await page.setViewportSize({ width: 650, height: 480 });
    await expect.poll(async () => { const r = await cards.first().boundingBox(); return r.x >= 0 && r.y >= 36 && r.x + r.width <= 651 && r.y + r.height <= 481; }).toBe(true);
    await page.evaluate(() => document.body.style.setProperty('--file-line-width', '100%'));
    const before = await scroller().boundingBox(); await pin('composite.svg', 340, 130); expect(await scroller().boundingBox()).toEqual(before);
    await page.setViewportSize({ width: 1500, height: 950 });
  });
  await check('Popout has its own full-window canvas, global geometry and complete close cleanup', async () => {
    await page.evaluate(async () => { await app.vault.create('Window.md', '# Popout\n\n![[composite.svg]]'); });
    await open('Window.md', true); await pin('composite.svg', 100, 140); const [id] = await ids();
    const popupPromise = page.context().waitForEvent('page');
    await page.evaluate(() => { app.workspace.moveLeafToPopout(app.workspace.activeLeaf); });
    const popup = await popupPromise; await popup.waitForLoadState('domcontentloaded');
    await popup.bringToFront();
    const popCard = popup.locator(`.rs-pin[data-pin-id="${id}"]`);
    await expect(popCard).toBeVisible(); await expect(card(id)).toHaveCount(0);
    await expect(popup.locator('.rs-canvas')).toHaveCount(1);
    await popCard.hover(); await popCard.getByRole('button', { name: 'Reference actions', exact: true }).click();
    await popup.screenshot({ path: 'test-results/popout-actions.png' });
    await popup.getByText('Keep across notes', { exact: true }).click();
    await expect(card(id)).toBeVisible(); const primary = await card(id).boundingBox();
    await popCard.focus(); await popup.keyboard.press('ArrowRight');
    expect(await card(id).boundingBox()).toEqual(primary);
    const closed = popup.waitForEvent('close'); await popup.keyboard.press('Meta+w'); await closed;
    await page.bringToFront(); await expect(card(id)).toBeVisible();

    await expect.poll(() => page.evaluate(() => app.plugins.plugins['reference-shelf'].windows.size)).toBe(1);
    await expect.poll(() => page.evaluate(() => app.plugins.plugins['reference-shelf'].store.globalPlacements.size)).toBe(1);
    await card(id).hover(); await card(id).getByRole('button', { name: 'Unpin reference', exact: true }).click();
    await open('Renamed.md');
  });
  await check('Non-Markdown views hide ordinary pins without clearing open-note membership', async () => {
    const before = await ids(); expect(before.length).toBeGreaterThan(0);
    await page.evaluate(async () => { const leaf = app.workspace.getLeaf('tab'); await leaf.setViewState({ type: 'empty' }); app.workspace.setActiveLeaf(leaf, { focus: true }); });
    await expect(cards).toHaveCount(0); await open('Renamed.md'); await expect(cards).toHaveCount(before.length);
  });
  await check('PNG JPG JPEG WEBP, 4K and extreme tall images retain reachable controls', async () => {
    const formats = [['format.png', 'image/png', 3840, 2160], ['format.jpg', 'image/jpeg', 900, 600], ['format.jpeg', 'image/jpeg', 600, 900], ['format.webp', 'image/webp', 900, 600], ['tall.png', 'image/png', 50, 3000]];
    await page.evaluate(async formats => {
      for (const [name, mime, width, height] of formats) {
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#efe8df'; ctx.fillRect(0, 0, width, height); ctx.fillStyle = '#3f706f'; ctx.fillRect(0, 0, width / 2, height / 2);
        const data = Uint8Array.from(atob(canvas.toDataURL(mime).split(',')[1]), c => c.charCodeAt(0));
        await app.vault.createBinary(name, data.buffer);
      }
      await app.vault.create('Formats.md', formats.map(([name]) => `![[${name}]]`).join('\n\n'));
    }, formats);
    await open('Formats.md', true);
    for (const [name, , width] of formats) {
      await pin(name, 60, 120); await expect(cards).toHaveCount(1);
      await expect(cards.first().locator('img')).toHaveJSProperty('naturalWidth', width);
      await cards.first().hover(); await expect(cards.first().getByRole('button', { name: 'Unpin reference', exact: true })).toBeInViewport();
      expect((await cards.first().boundingBox()).width).toBeGreaterThanOrEqual(160);
      await cards.first().getByRole('button', { name: 'Unpin reference', exact: true }).click();
    }
    await open('Renamed.md');
  });
  await check('Disable and workspace reload remove all canvas nodes and session data', async () => {
    await page.evaluate(() => app.plugins.disablePlugin('reference-shelf')); await expect(page.locator('.rs-canvas')).toHaveCount(0);
    await expect(page.locator('.rs-crop-dialog, .rs-preview-dialog')).toHaveCount(0);
    await page.evaluate(() => app.plugins.enablePlugin('reference-shelf')); await expect(cards).toHaveCount(0);
    await pin('composite.svg', 60, 120); await expect(cards).toHaveCount(1);
    await page.reload(); await page.waitForFunction(() => !!app.plugins?.plugins['reference-shelf']); await expect(cards).toHaveCount(0);
  });
  await check('Final Markdown and original composite image hashes unchanged', async () => {
    expect(hash(await readFile(path.join(fixture.vault, 'Renamed.md')))).toBe(hash(fixture.note));
    expect(hash(await readFile(path.join(fixture.vault, 'composite.svg')))).toBe(originalImage);
  });
  expect(errors).toEqual([]);
  await writeFile('test-results/live-results.json', JSON.stringify({ fixture: fixture.root, hostArchive: path.basename(hostArchive), platform: process.platform, version, checks, errors, passed: true }, null, 2));
} catch (error) {
  console.error('FAILURE', error);
  await mkdir('test-results', { recursive: true }); await page.screenshot({ path: 'test-results/failure.png' }).catch(() => {});
  console.error('HOST', app.logs()); console.error('ERRORS', errors); console.error('DOM', (await page.locator('body').innerText().catch(() => 'Renderer unavailable')).slice(-5000)); throw error;
} finally { await app.close(); }
