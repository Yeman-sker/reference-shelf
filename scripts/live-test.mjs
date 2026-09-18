import { expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { setup } from './live-setup.mjs';
import { launch } from './live-launch.mjs';

const fixture=await setup();
console.log('Isolated vault:',fixture.vault);
const app=await launch(fixture.profile); const page=app.page;
const results=[]; const errors=[]; let hostArchive='';
page.on('pageerror',error=>errors.push(error.message));
async function check(name,run){await run();results.push(name);console.log('PASS',name);}
async function open(file,newLeaf=false){return page.evaluate(async({file,newLeaf})=>{
 const leaf=app.workspace.getLeaf(newLeaf?'tab':false); await leaf.openFile(app.vault.getAbstractFileByPath(file));
 await leaf.setViewState({type:'markdown',state:{file,mode:'preview'}}); app.workspace.setActiveLeaf(leaf,{focus:true});
 return leaf.id;
},{file,newLeaf});}
async function pin(selector){await page.locator(selector+':visible').first().click({button:'right'});await page.getByText('Pin to Reference Shelf',{exact:true}).click();}
const shelf=page.locator('.workspace-leaf.mod-active .reference-shelf');
const hash=text=>createHash('sha256').update(text).digest('hex');
try{
 await page.waitForFunction(()=>!!window.app?.workspace?.layoutReady);
 const trust=page.getByRole('button',{name:/信任仓库作者并启用插件|Trust author and enable plugins/});
 if(await trust.count()) await trust.click();
 await page.waitForFunction(()=>!!app.plugins.plugins['reference-shelf']);
 await open('A.md');
 hostArchive=app.logs().match(/Loading updated app package ([^\n]+)/)?.[1] ?? '';
 expect(hostArchive).toContain(path.basename(process.env.OBSIDIAN_ASAR ?? 'obsidian-1.13.7.asar'));
 console.log('Host archive:',path.basename(hostArchive));
 await check('Reading View context-menu pin and contain',async()=>{
   await pin('.workspace-leaf.mod-active .view-content img[src*="wide.svg"]');
   await expect(shelf).toBeVisible();await expect(shelf.locator('img')).toHaveJSProperty('naturalWidth',1200);
   expect(await shelf.locator('img').evaluate(el=>getComputedStyle(el).objectFit)).toBe('contain');
 });
 await check('Independent scroll beyond five screens',async()=>{
   const before=await shelf.boundingBox();
   const scroller=page.locator('.workspace-leaf.mod-active .markdown-preview-view');
   await scroller.evaluate(el=>{el.scrollTop=el.clientHeight*6;});
   expect(await scroller.evaluate(el=>el.scrollTop)).toBeGreaterThan(1000);
   expect((await shelf.boundingBox()).y).toBe(before.y);
 });
 await check('Resize with pointer and keyboard; collapse and restore',async()=>{
   const divider=shelf.getByRole('separator');const box=await divider.boundingBox();const before=(await shelf.boundingBox()).height;
   await page.mouse.move(box.x+box.width/2,box.y+4);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+70,{steps:10});await page.mouse.up();
   expect((await shelf.boundingBox()).height).toBeGreaterThan(before);
   await divider.focus();await page.keyboard.press('ArrowUp');
   const height=(await shelf.boundingBox()).height;
   await shelf.getByRole('button',{name:'Collapse reference',exact:true}).click();expect((await shelf.boundingBox()).height).toBe(32);
   await shelf.getByRole('button',{name:'Expand reference',exact:true}).click();expect((await shelf.boundingBox()).height).toBe(height);
 });
 await check('Tab switching preserves pin and keeps other notes clean',async()=>{
   await open('B.md',true);await expect(shelf).toHaveCount(0);
   await pin('.workspace-leaf.mod-active .view-content img[src*="other.svg"]');
   await expect(shelf.locator('img[src*="other.svg"]')).toBeVisible();
   await expect(page.locator('.reference-shelf[data-note="A.md"] img[src*="wide.svg"]')).toHaveCount(1);
   await shelf.getByRole('button',{name:'Unpin reference',exact:true}).click();
   await expect(page.locator('.reference-shelf[data-note="A.md"]')).toHaveCount(1);
   await page.evaluate(()=>{const l=app.workspace.getLeavesOfType('markdown').find(l=>l.view.file?.path==='A.md');app.workspace.setActiveLeaf(l,{focus:true});});
   await expect(shelf).toBeVisible();
 });
 await check('Same-note split shares references, not collapse state',async()=>{
   await page.evaluate(async()=>{const l=app.workspace.getLeaf('split','vertical');await l.openFile(app.vault.getAbstractFileByPath('A.md'));await l.setViewState({type:'markdown',state:{file:'A.md',mode:'preview'}});app.workspace.setActiveLeaf(l,{focus:true});});
   await expect(page.locator('.reference-shelf')).toHaveCount(2);
   await shelf.getByRole('button',{name:'Collapse reference',exact:true}).click();
   expect(await page.locator('.reference-shelf.is-collapsed').count()).toBe(1);
   await page.locator('.workspace-leaf.mod-active .markdown-preview-view').evaluate(el=>{el.scrollTop=0;});
   await pin('.workspace-leaf.mod-active .view-content img[src*="other.svg"]');
   await expect(page.locator('.reference-shelf img[src*="other.svg"]')).toHaveCount(2);
   await shelf.getByRole('button',{name:'Unpin reference',exact:true}).click();await expect(page.locator('.reference-shelf')).toHaveCount(0);
 });
 await check('Drag-to-top pins without changing note',async()=>{
   const img=page.locator('.workspace-leaf.mod-active .view-content img[src*="wide.svg"]:visible').first();
   await img.scrollIntoViewIfNeeded();
   const b=await img.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();
   await page.mouse.move(b.x+b.width/2+20,b.y+b.height/2+20,{steps:5});
   await expect(page.locator('.reference-shelf-drop-zone')).toBeVisible();
   const d=await page.locator('.reference-shelf-drop-zone').boundingBox();await page.mouse.move(d.x+d.width/2,d.y+d.height/2,{steps:10});await page.mouse.up();
   await expect(shelf.locator('img[src*="wide.svg"]')).toBeVisible();await expect(page.locator('.reference-shelf-drop-zone')).toHaveCount(0);
 });
 await check('Closing one tab preserves; closing last releases',async()=>{
   await page.evaluate(()=>{const leaves=app.workspace.getLeavesOfType('markdown').filter(l=>l.view.file?.path==='A.md');leaves.find(l=>l!==app.workspace.activeLeaf).detach();});
   await expect(page.locator('.reference-shelf')).toHaveCount(1);
   await page.evaluate(()=>app.workspace.activeLeaf.detach());await expect(page.locator('.reference-shelf')).toHaveCount(0);
   await open('A.md',true);await expect(shelf).toHaveCount(0);
 });
 await check('Live Preview context menu and mode changes',async()=>{
   await page.evaluate(async()=>{await app.workspace.activeLeaf.setViewState({type:'markdown',state:{file:'A.md',mode:'source',source:false}});});
   await pin('.workspace-leaf.mod-active .view-content img[src*="wide.svg"]');await expect(shelf.locator('img')).toBeVisible();
   await page.evaluate(async()=>{await app.workspace.activeLeaf.setViewState({type:'markdown',state:{file:'A.md',mode:'preview'}});});
   await expect(shelf.locator('img')).toBeVisible();
 });
 await check('Live Preview drag, cancelled drag and tab movement',async()=>{
   await shelf.getByRole('button',{name:'Unpin reference',exact:true}).click();
   await page.evaluate(async()=>{await app.workspace.activeLeaf.setViewState({type:'markdown',state:{file:'A.md',mode:'source',source:false}});});
   const img=page.locator('.workspace-leaf.mod-active .view-content img[src*="wide.svg"]:visible').first();
   await img.scrollIntoViewIfNeeded(); let b=await img.boundingBox();
   await page.mouse.move(b.x+b.width/2,b.y+b.height/2); await page.mouse.down(); await page.mouse.move(b.x+b.width/2+20,b.y+b.height/2+20,{steps:5});
   await expect(page.locator('.reference-shelf-drop-zone')).toBeVisible(); await page.keyboard.press('Escape'); await page.mouse.up();
   await expect(page.locator('.reference-shelf-drop-zone')).toHaveCount(0); await expect(shelf).toHaveCount(0);
   b=await img.boundingBox(); await page.mouse.move(b.x+b.width/2,b.y+b.height/2); await page.mouse.down(); await page.mouse.move(b.x+b.width/2+20,b.y+b.height/2+20,{steps:5});
   const zone=page.locator('.reference-shelf-drop-zone');await expect(zone).toBeVisible();const z=await zone.boundingBox();
   await page.mouse.move(z.x+z.width/2,z.y+z.height/2,{steps:10});await page.mouse.up();await expect(shelf.locator('img')).toBeVisible();
   // Move the actual leaf via Obsidian's own tab drag implementation.
   const before=await page.evaluate(()=>{window.__movingLeaf=app.workspace.activeLeaf;return app.workspace.activeLeaf.parent.id;});
   await page.evaluate(async()=>{const l=app.workspace.getLeaf('split','vertical');await l.openFile(app.vault.getAbstractFileByPath('B.md'));});
   const tabA=page.locator('.workspace-tab-header').filter({has:page.locator('.workspace-tab-header-inner-title',{hasText:/^A$/})}).first();
   const tabB=page.locator('.workspace-tab-header').filter({has:page.locator('.workspace-tab-header-inner-title',{hasText:/^B$/})}).last();
   await tabA.dragTo(tabB,{targetPosition:{x:15,y:15}});
   await expect.poll(()=>page.evaluate(()=>window.__movingLeaf.parent.id)).not.toBe(before);
   await page.evaluate(()=>app.workspace.setActiveLeaf(window.__movingLeaf,{focus:true}));await expect(shelf.locator('img')).toBeVisible();
   await page.evaluate(async()=>{for(const leaf of app.workspace.getLeavesOfType('markdown'))if(leaf.view.file?.path==='B.md')leaf.detach();await app.workspace.activeLeaf.setViewState({type:'markdown',state:{file:'A.md',mode:'preview'}});});
 });
 await check('Broken decode and missing file show recoverable error',async()=>{
   await pin('.workspace-leaf.mod-active .view-content img[src*="broken.png"]');await expect(shelf.getByText('Image unavailable')).toBeVisible();
   await pin('.workspace-leaf.mod-active .view-content img[src*="wide.svg"]');
   await page.evaluate(async()=>app.vault.delete(app.vault.getAbstractFileByPath('wide.svg')));
   await expect(shelf.getByText('Image unavailable')).toBeVisible();await expect(shelf.getByRole('button',{name:'Retry'})).toBeVisible();
 });
 await check('Image rename updates source; note rename preserves pin',async()=>{
   await pin('.workspace-leaf.mod-active .view-content img[src*="other.svg"]');
   await page.evaluate(async()=>app.vault.rename(app.vault.getAbstractFileByPath('other.svg'),'renamed.svg'));
   await expect(shelf.locator('img[src*="renamed.svg"]')).toBeVisible();
   await page.evaluate(async()=>app.vault.rename(app.vault.getAbstractFileByPath('A.md'),'Renamed.md'));
   await expect(shelf).toHaveAttribute('data-note','Renamed.md');await expect(shelf.locator('img')).toBeVisible();
 });
 await mkdir('test-results',{recursive:true});
 await check('Light and dark screenshots',async()=>{
   await page.locator('.workspace-leaf.mod-active .markdown-preview-view').evaluate(el=>{el.scrollTop=1200;});
   await page.evaluate(()=>{document.body.classList.remove('theme-dark');document.body.classList.add('theme-light');});
   await page.screenshot({path:'test-results/obsidian-light.png'});
   await page.evaluate(()=>{document.body.classList.remove('theme-light');document.body.classList.add('theme-dark');});
   await page.screenshot({path:'test-results/obsidian-dark.png'});
 });
 await check('Disable removes owned DOM; enable does not restore session pins',async()=>{
   await page.evaluate(()=>app.plugins.disablePlugin('reference-shelf'));
   await expect(page.locator('.reference-shelf')).toHaveCount(0);await expect(page.locator('.reference-shelf-host')).toHaveCount(0);
   await page.evaluate(()=>app.plugins.enablePlugin('reference-shelf'));await expect(page.locator('.reference-shelf')).toHaveCount(0);
 });
 await check('PNG JPG JPEG WEBP SVG including 4K and tall images',async()=>{
   await page.evaluate(async()=>{
     const canvas=document.createElement('canvas');canvas.width=3840;canvas.height=2160;const ctx=canvas.getContext('2d');
     ctx.fillStyle='#faf8f5';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#5f554a';ctx.font='80px sans-serif';ctx.fillText('4K local reference',100,200);
     for(const ext of ['png','jpg','jpeg','webp']){
       const url=canvas.toDataURL(ext==='png'?'image/png':ext==='webp'?'image/webp':'image/jpeg');
       const data=Uint8Array.from(atob(url.split(',')[1]),c=>c.charCodeAt(0));await app.vault.createBinary('format.'+ext,data.buffer);
     }
     canvas.width=240;canvas.height=6000;ctx.fillStyle='#faf8f5';ctx.fillRect(0,0,240,6000);
     const data=Uint8Array.from(atob(canvas.toDataURL().split(',')[1]),c=>c.charCodeAt(0));await app.vault.createBinary('tall.png',data.buffer);
     await app.vault.create('Formats.md','# Formats\n\n'+['png','jpg','jpeg','webp'].map(ext=>'![[format.'+ext+'|300]]').join('\n\n')+'\n\n![[tall.png|120]]\n\n![[renamed.svg]]');
   });
   await open('Formats.md',true);
   for(const ext of ['png','jpg','jpeg','webp']){
     await pin('.workspace-leaf.mod-active .view-content img[src*="format.'+ext+'"]');
     await expect(shelf.locator('img')).toHaveJSProperty('naturalWidth',3840);
   }
   await pin('.workspace-leaf.mod-active .view-content img[src*="tall.png"]');await expect(shelf.locator('img')).toHaveJSProperty('naturalHeight',6000);
   await pin('.workspace-leaf.mod-active .view-content img[src*="renamed.svg"]');await expect(shelf.locator('img')).toHaveJSProperty('naturalWidth',1200);
 });
 await check('Workspace reload clears pins and preserves only height preference',async()=>{
   const pref=JSON.parse(await readFile(path.join(fixture.vault,'.obsidian/plugins/reference-shelf/data.json'),'utf8'));
   expect(Object.keys(pref)).toEqual(['lastHeight']);expect(pref.lastHeight).toBeGreaterThan(0);
   await page.reload();await page.waitForFunction(()=>!!app.plugins?.plugins['reference-shelf']);
   await expect(page.locator('.reference-shelf')).toHaveCount(0);
   expect(await page.evaluate(()=>app.plugins.plugins['reference-shelf'].store.lastHeight)).toBe(pref.lastHeight);
 });
 await check('Navigating to a non-Markdown view removes the shelf',async()=>{
   await open('Formats.md');await pin('.workspace-leaf.mod-active .view-content img[src*="format.png"]');
   await page.evaluate(()=>app.workspace.activeLeaf.setViewState({type:'empty',state:{}}));
   await expect(page.locator('.reference-shelf')).toHaveCount(0);
   expect(await page.evaluate(()=>app.plugins.plugins['reference-shelf'].store.pins.size)).toBe(0);
 });
 await check('Markdown bytes unchanged',async()=>{
   expect(hash(await readFile(path.join(fixture.vault,'Renamed.md')))).toBe(hash(fixture.note));
 });
 expect(errors).toEqual([]);
 console.log('PASS no renderer exceptions');
 await writeFile('test-results/live-results.json',JSON.stringify({fixture:fixture.root,hostArchive:path.basename(hostArchive),platform:process.platform,checks:results,errors,passed:true},null,2));
}catch(error){
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/failure.png'}).catch(()=>{});
 console.error(app.logs());console.error('DOM', (await page.locator('body').innerText()).slice(0,3000));console.error('ERRORS',errors);throw error;
}finally{await app.close();}
