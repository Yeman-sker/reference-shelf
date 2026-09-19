import { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

// Capture actual compositor frames, not a reconstruction or an animation mock.
async function record(page) {
  if (process.env.RS_RECORD_MOTION !== '1') return async () => {};
  const session = await page.context().newCDPSession(page), frames = [];
  session.on('Page.screencastFrame', frame => {
    frames.push({ data: frame.data, time: frame.metadata.timestamp });
    void session.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
  });
  await session.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: 1200, maxHeight: 760, everyNthFrame: 1 });
  let stopped = false;
  return async () => {
    if (stopped) return; stopped = true;
    await session.send('Page.stopScreencast'); await session.detach();
    expect(frames.length).toBeGreaterThan(10);
    await mkdir('test-results/motion-frames', { recursive: true });
    const lines = ['ffconcat version 1.0'];
    for (let i = 0; i < frames.length; i++) {
      const name = `frame-${String(i).padStart(5, '0')}.jpg`;
      await writeFile(`test-results/motion-frames/${name}`, Buffer.from(frames[i].data, 'base64'));
      lines.push(`file '${name}'`, `duration ${Math.max(1 / 120, (frames[i + 1]?.time ?? frames[i].time + .3) - frames[i].time)}`);
    }
    lines.push(`file 'frame-${String(frames.length - 1).padStart(5, '0')}.jpg'`);
    await writeFile('test-results/motion-frames/frames.ffconcat', lines.join('\n'));
    const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'test-results/motion-frames/frames.ffconcat', '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '23', '-movflags', '+faststart', 'test-results/reference-shelf-motion.mp4'], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`Motion recording: ${result.error ?? result.stderr}`);
  };
}

export async function motionChecks({ page, check, card, a, b, movePin }) {
  const canvas = page.locator('.rs-canvas'), tools = id => card(id).locator('.rs-tools');
  const idle = id => expect.poll(() => card(id).evaluate(el => el.getAnimations().filter(a => a.playState === 'running').length)).toBe(0);
  const collapse = async id => { await card(id).hover(); await card(id).getByRole('button', { name: 'Collapse reference', exact: true }).click(); await idle(id); };
  const expand = async id => { await card(id).getByRole('button', { name: 'Expand reference', exact: true }).click(); await idle(id); };
  const originalA = await card(a).boundingBox(), originalB = await card(b).boundingBox();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => getSelection()?.removeAllRanges());
  const stop = await record(page), metrics = {};
  try {
    await check('UI: no header or handle; hover tools use the outward corner and disappear cleanly', async () => {
      await expect(page.locator('.rs-pin-header, .rs-drag-handle')).toHaveCount(0);
      await page.mouse.click(800, 800);
      for (const id of [a, b]) {
        await expect.poll(() => tools(id).evaluate(el => getComputedStyle(el).opacity)).toBe('0');
        const frame = await card(id).boundingBox(), image = await card(id).locator('.rs-image-window').boundingBox();
        expect(image).toEqual(frame); await card(id).hover();
        await expect.poll(() => tools(id).evaluate(el => getComputedStyle(el).opacity)).toBe('1');
        const panel = await tools(id).boundingBox();
        expect(id === a ? panel.x - frame.x : frame.x + frame.width - panel.x - panel.width).toBeCloseTo(10, 0);
        await tools(id).hover(); await expect(tools(id)).toHaveCSS('opacity', '1');
        await page.screenshot({ path: `test-results/hover-${id === a ? 'left' : 'right'}.png` });
        await page.mouse.move(800, 800);
      }
    });
    await check('Motion: both corner-anchored folds have real intermediate frames and restore exact crops and size', async () => {
      for (const id of [a, b]) {
        const before = await card(id).boundingBox();
        await page.evaluate(id => {
          const el = document.querySelector(`[data-pin-id="${id}"]`);
          window.__rsFrames = []; window.__rsSampling = id;
          const sample = () => {
            if (window.__rsSampling !== id) return;
            const r = el.getBoundingClientRect(); window.__rsFrames.push({ x: r.x, y: r.y, width: r.width, height: r.height });
            requestAnimationFrame(sample);
          }; requestAnimationFrame(sample);
        }, id);
        await collapse(id);
        metrics[id] = await page.evaluate(() => { window.__rsSampling = false; return window.__rsFrames; });
        expect(metrics[id].some(r => r.width > 50 && r.width < before.width - 5)).toBe(true);
        for (const r of metrics[id]) {
          expect(id === b ? r.x + r.width : r.x).toBeCloseTo(id === b ? before.x + before.width : before.x, 0);
          expect(r.y).toBeCloseTo(before.y, 0);
        }
        const orb = await card(id).boundingBox(); expect(orb.width).toBe(44); expect(orb.height).toBe(44);
        await expect(card(id)).toHaveCSS('border-radius', '22px');
        await page.screenshot({ path: `test-results/folded-${id === a ? 'left' : 'right'}.png` });
        await expand(id); expect(await card(id).boundingBox()).toEqual(before);
      }
    });
    await check('Motion: direct image drag has live blur, edge preview, magnetic landing and complete Escape cleanup', async () => {
      const before = await card(a).boundingBox();
      await page.mouse.move(before.x + 30, before.y + 100); await page.mouse.down();
      await page.mouse.move(36, before.y + 160, { steps: 20 });
      await expect(canvas).toHaveClass(/is-dragging/); await expect(page.locator('.rs-snap-guide')).toHaveClass(/is-visible/);
      await expect(page.locator('.rs-focus-scrim')).toHaveCSS('backdrop-filter', 'blur(1.25px)');
      expect(await card(a).evaluate(el => getComputedStyle(el).filter)).toBe('none');
      await page.screenshot({ path: 'test-results/dragging.png' });
      await page.mouse.up(); await idle(a); expect((await card(a).boundingBox()).x).toBe(12);
      await expect(canvas).not.toHaveClass(/is-dragging/);
      const landed = await card(a).boundingBox();
      await page.mouse.move(landed.x + 30, landed.y + 100); await page.mouse.down();
      for (let i = 1; i <= 90; i++) { await page.mouse.move(landed.x + 30 + (900 - landed.x - 30) * i / 90, landed.y + 100 + (300 - landed.y - 100) * i / 90); await delay(8); }
      await expect(card(a)).toHaveAttribute('data-side', 'left'); // Never jump sides mid-drag.
      await page.keyboard.press('Escape'); await page.mouse.up(); expect(await card(a).boundingBox()).toEqual(landed);
      await expect(canvas).not.toHaveClass(/is-dragging/); await expect(page.locator('.rs-snap-guide')).not.toHaveClass(/is-visible/);
      await movePin(a, before.x + 24, before.y + 80); await idle(a);
    });
    await check('Resize: opposite-sign diagonals stay continuous at all four corners, with no release bounce', async () => {
      const original = await card(a).boundingBox();
      await movePin(a, 424, 300); await idle(a);
      for (const corner of ['nw', 'ne', 'sw', 'se']) {
        const initial = await card(a).boundingBox(), west = corner.includes('w'), north = corner.includes('n');
        await card(a).hover();
        const handle = await card(a).locator(`.rs-resize-${corner}`).boundingBox(), x = handle.x + 5, y = handle.y + 5;
        await page.mouse.move(x, y); await page.mouse.down();
        let previous;
        for (const dy of [-38, -39, -40, -41, -40, -39]) {
          await page.mouse.move(x + (west ? -60 : 60), y + (north ? -dy : dy));
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const r = await card(a).boundingBox();
          if (previous !== undefined) expect(Math.abs(r.width - previous)).toBeLessThan(2);
          expect(r.x + (west ? r.width : 0)).toBeCloseTo(initial.x + (west ? initial.width : 0), 0);
          expect(r.y + (north ? r.height : 0)).toBeCloseTo(initial.y + (north ? initial.height : 0), 0);
          previous = r.width;
        }
        await page.keyboard.press('Escape'); await page.mouse.up(); expect(await card(a).boundingBox()).toEqual(initial);
      }
      const handle = await card(a).locator('.rs-resize-se').boundingBox();
      await page.mouse.move(handle.x + 5, handle.y + 5); await page.mouse.down();
      for (let i = 1; i <= 90; i++) { const d = 100 * Math.sin(Math.PI * i / 90); await page.mouse.move(handle.x + 5 + d, handle.y + 5 + d); await delay(8); }
      await page.mouse.up();
      expect(await card(a).evaluate(el => el.getAnimations().some(a => a.effect?.getKeyframes().some(k => k.transform)))).toBe(false);
      await movePin(a, original.x + 24, original.y + 80); await idle(a);
    });
    await stop();
    await check('UI: a dragged orb stays folded, switches sides without jumping and restores full size', async () => {
      await collapse(b); const orb = await card(b).boundingBox();
      await page.mouse.move(orb.x + 22, orb.y + 22); await page.mouse.down(); await page.mouse.move(420, 620, { steps: 25 }); await page.mouse.up(); await idle(b);
      await expect(card(b)).toHaveClass(/is-collapsed/); await expect(card(b)).toHaveAttribute('data-side', 'left');
      const moved = await card(b).boundingBox(); expect(moved.x).toBeCloseTo(398, 0);
      await expand(b); const full = await card(b).boundingBox();
      expect(full.width).toBe(originalB.width); expect(full.height).toBe(originalB.height); expect(full.x).toBe(moved.x);
      await movePin(b, originalB.x + 24, originalB.y + 80); await idle(b);
    });
    await check('Motion: fast keyboard reversals settle without stale animations, orphan focus or lost size', async () => {
      await card(b).focus();
      for (let i = 0; i < 6; i++) await page.keyboard.press('Enter');
      await idle(b); await expect(card(b)).not.toHaveClass(/is-collapsed|is-morphing/);
      expect((await card(b).boundingBox()).width).toBe(originalB.width);
      expect(await card(b).evaluate(el => el.contains(document.activeElement))).toBe(true);
      await page.mouse.click(800, 800);
    });
    await check('Interruption: hiding mid-drag restores geometry and removes blur and capture', async () => {
      const before = await card(a).boundingBox();
      await page.mouse.move(before.x + 30, before.y + 100); await page.mouse.down(); await page.mouse.move(600, 280, { steps: 12 });
      await page.keyboard.press('Meta+Shift+Y'); await expect(canvas).toHaveClass(/rs-hidden/);
      await expect(canvas).not.toHaveClass(/is-dragging/); await expect(card(a)).not.toHaveClass(/is-manipulating/);
      await page.mouse.up(); await page.keyboard.press('Meta+Shift+Y'); await expect(canvas).not.toHaveClass(/rs-hidden/);
      expect(await card(a).boundingBox()).toEqual(before);
    });
    await check('Accessibility: reduced motion is immediate and switching preferences cancels in-flight effects', async () => {
      await card(b).focus(); await page.keyboard.press('Enter');
      await page.emulateMedia({ reducedMotion: 'reduce' }); await idle(b);
      await expect(card(b)).not.toHaveClass(/is-morphing/); await expect(card(b)).toHaveClass(/is-collapsed/);
      await expand(b); expect(await card(b).evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
      await expect(page.locator('.rs-focus-scrim')).toHaveCSS('backdrop-filter', 'none');
      await collapse(b); await page.setViewportSize({ width: 720, height: 540 });
      const r = await card(b).boundingBox(); expect(r.x).toBeGreaterThanOrEqual(0); expect(r.x + r.width).toBeLessThanOrEqual(720);
      await expand(b); const full = await card(b).boundingBox(); expect(full.x + full.width).toBeLessThanOrEqual(720); expect(full.y + full.height).toBeLessThanOrEqual(540);
      await page.setViewportSize({ width: 1500, height: 950 });
      await movePin(a, originalA.x + 24, originalA.y + 80); await movePin(b, originalB.x + 24, originalB.y + 80);
      await page.mouse.click(800, 800);
    });
    await writeFile('test-results/motion-results.json', JSON.stringify({ passed: true, reducedMotionTested: true, frames: metrics }, null, 2));
  } finally { await stop(); await page.emulateMedia({ reducedMotion: 'reduce' }); }
}
