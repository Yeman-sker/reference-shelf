import { setup } from './live-setup.mjs';
import { launch } from './live-launch.mjs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
const fixture = await setup(), host = await launch(fixture.profile), page = host.page;
const results = [];
try {
  await page.waitForFunction(() => window.app?.workspace?.layoutReady);
  const trust = page.getByRole('button', { name: /信任仓库作者并启用插件|Trust author and enable plugins/ });
  if (await trust.count()) await trust.click();
  await page.waitForFunction(() => !!app.plugins.plugins['reference-shelf']);
  await page.evaluate(() => app.setting.close()); await page.bringToFront();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(async () => {
    const leaf = app.workspace.getLeaf(false); await leaf.openFile(app.vault.getAbstractFileByPath('A.md'));
    await leaf.setViewState({type:'markdown',state:{file:'A.md',mode:'preview'}});
    app.workspace.setActiveLeaf(leaf,{focus:true}); app.workspace.leftSplit.collapse(); app.workspace.rightSplit.collapse();
  });
  await delay(300);
  const cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable');
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  for (const width of (process.env.DIAG_WIDTHS ?? '1500,3000').split(',').map(Number)) {
    await page.setViewportSize({width,height:width===1500?950:1900}); await delay(100);
    for (const variant of (process.env.DIAG_VARIANTS ?? 'baseline,no-blur,no-effects,cached-bounds').split(',')) {
      await page.evaluate(variant => {
        const p=app.plugins.plugins['reference-shelf']; p.store.clear(); p.sync();
        document.getElementById('rs-diagnostic-style')?.remove();
        const style=document.createElement('style'); style.id='rs-diagnostic-style';
        style.textContent=variant==='no-blur'?'.rs-focus-scrim,.rs-tools{backdrop-filter:none!important}':variant==='no-effects'?'.rs-canvas *{backdrop-filter:none!important;box-shadow:none!important;transition:none!important}':'';
        const overrides = {'no-shadow':'.rs-canvas *{box-shadow:none!important}', 'no-transitions':'.rs-canvas *{transition:none!important}', 'no-pin-transition':'.rs-pin{transition:none!important}', 'no-tools-transition':'.rs-tools,.rs-tools *{transition:none!important}', 'no-scrim-transition':'.rs-focus-scrim{transition:none!important}'};
        if(overrides[variant])style.textContent=overrides[variant];
        document.head.append(style);
        const pin=p.store.add('A.md',{type:'image',path:'composite.svg'},1000,660);p.sync();
        const canvas=p.windows.get(document).canvas, card=canvas.cards.get(pin.id);
        Object.assign(card.placement,{x:120,y:150,width:500,side:'left'}); card.draw();
        if(variant==='cached-bounds'){const b=canvas.bounds();card.bounds=()=>b;}
        window.__diag={frames:[],events:[],draws:[],bounds:[]};
        const draw=card.draw.bind(card);card.draw=function(){const t=performance.now();try{return draw();}finally{window.__diag.draws.push(performance.now()-t);}};
        const bounds=card.bounds.bind(card);card.bounds=function(){const t=performance.now();try{return bounds();}finally{window.__diag.bounds.push(performance.now()-t);}};
        if(!window.__diagInstalled){
          document.addEventListener('pointermove',e=>{if(window.__diagActive)window.__diag.events.push({t:performance.now(),x:e.clientX,y:e.clientY});},true);
          const frame=t=>{if(window.__diagActive)window.__diag.frames.push(t);requestAnimationFrame(frame);};requestAnimationFrame(frame);window.__diagInstalled=true;
        }
      },variant);
      await page.locator('.rs-pin img').waitFor(); await delay(120);
      for(const kind of ['move','resize']) {
        const box=await page.locator(kind==='move'?'.rs-pin':'.rs-resize-se').boundingBox();
        const start={x:box.x+(kind==='move'?100:5),y:box.y+(kind==='move'?100:5)};
        await page.mouse.move(start.x,start.y); await delay(100);
        const before=await metrics();
        await page.evaluate(()=>{window.__diag={frames:[],events:[],draws:[],bounds:[]};window.__diagActive=true;});
        await page.mouse.down();
        for(let i=1;i<=90;i++){await page.mouse.move(start.x+300*i/90,start.y+100*i/90);await delay(8);}
        await page.mouse.up(); await delay(320);
        const data=await page.evaluate(()=>{window.__diagActive=false;return window.__diag;}); const after=await metrics();
        const dt=data.frames.slice(1).map((t,i)=>t-data.frames[i]), gaps=data.events.slice(1).map((e,i)=>e.t-data.events[i].t);
        const stats=arr=>{const s=[...arr].sort((a,b)=>a-b);return {n:s.length,p50:s[Math.floor(s.length*.5)]??0,p95:s[Math.floor(s.length*.95)]??0,max:s.at(-1)??0};};
        const result={width,variant,kind,raf:stats(dt),input:stats(gaps),draw:stats(data.draws),bounds:stats(data.bounds),layoutCount:after.LayoutCount-before.LayoutCount,layoutMs:1000*(after.LayoutDuration-before.LayoutDuration),styleCount:after.RecalcStyleCount-before.RecalcStyleCount,styleMs:1000*(after.RecalcStyleDuration-before.RecalcStyleDuration),taskMs:1000*(after.TaskDuration-before.TaskDuration)};
        result.stalls=data.frames.slice(1).map((t,i)=>({gap:t-data.frames[i],sinceFirstInput:t-data.events[0].t,beforeLastInput:data.events.at(-1).t-t})).filter(f=>f.gap>40);
        results.push(result);console.log(JSON.stringify(result));
      }
    }
  }
  // A one-pixel direction change near the resize axis-selection boundary.
  await page.evaluate(()=>{
    const p=app.plugins.plugins['reference-shelf'],card=[...p.windows.get(document).canvas.cards.values()][0];
    card.interrupt();Object.assign(card.placement,{x:120,y:150,width:500,side:'left'});card.draw();
    document.getElementById('rs-diagnostic-style').textContent='.rs-pin{transition:none!important}';
  });
  const corner=await page.locator('.rs-resize-se').boundingBox(), anchor={x:corner.x+5,y:corner.y+5};
  await page.mouse.move(anchor.x,anchor.y);await page.mouse.down();
  const resizing=[];
  for(const dy of [-38,-39,-40,-41,-40,-39]){
    await page.mouse.move(anchor.x+60,anchor.y+dy);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    resizing.push({dx:60,dy,box:await page.locator('.rs-pin').boundingBox()});
  }
  await page.keyboard.press('Escape');await page.mouse.up();console.log('RESIZE_BOUNDARY',JSON.stringify(resizing));
  const native=[];
  for(const variant of ['baseline','no-blur']){
    await page.evaluate(variant=>{
      const p=app.plugins.plugins['reference-shelf'];p.store.clear();p.sync();
      document.getElementById('rs-diagnostic-style').textContent=variant==='no-blur'?'.rs-focus-scrim{backdrop-filter:none!important}':'';
      document.querySelector('.workspace-leaf.mod-active .markdown-preview-view').scrollTop=0;
      window.__nativeEvents=[];
      if(!window.__nativeInstalled){document.addEventListener('dragover',e=>window.__nativeEvents.push(performance.now()),true);window.__nativeInstalled=true;}
    },variant);
    const image=page.locator('.workspace-leaf.mod-active .view-content img[src*="composite.svg"]:visible').first();
    await image.scrollIntoViewIfNeeded();const r=await image.boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2;
    await page.mouse.move(x,y);await page.mouse.down();
    await page.evaluate(()=>{window.__diag={frames:[],events:[],draws:[],bounds:[]};window.__diagActive=true;});
    for(let i=1;i<=90;i++){await page.mouse.move(x+300*i/90,y+80*i/90);await delay(8);}
    const previews=await page.locator('.rs-placement-preview').count();await page.mouse.up();await delay(320);
    const raw=await page.evaluate(()=>{window.__diagActive=false;return {frames:window.__diag.frames,events:window.__nativeEvents};});
    const stats=arr=>{const a=[...arr].sort((a,b)=>a-b);return {n:a.length,max:a.at(-1),p95:a[Math.floor(a.length*.95)]};};
    const result={variant,previews,pins:await page.locator('.rs-pin').count(),raf:stats(raw.frames.slice(1).map((t,i)=>t-raw.frames[i])),dragover:stats(raw.events.slice(1).map((t,i)=>t-raw.events[i]))};native.push(result);console.log('NATIVE',JSON.stringify(result));
  }
  const version=JSON.parse(await readFile('manifest.json','utf8')).version, buildSha256=createHash('sha256').update(await readFile('main.js')).digest('hex');
  await mkdir('test-results',{recursive:true});await writeFile(`test-results/${process.env.DIAG_NAME ?? 'interaction-diagnosis'}.json`,JSON.stringify({fixture:fixture.root,version,buildSha256,recording:false,results,resizing,native},null,2));
  if(process.env.DIAG_ASSERT==='1'){
    for(const r of results){assert(r.raf.max<50,`${r.width}/${r.kind}: renderer gap ${r.raf.max}ms`);assert(r.bounds.n<=6,`excessive bounds reads: ${r.bounds.n}`);}
    for(let i=1;i<resizing.length;i++)assert(Math.abs(resizing[i].box.width-resizing[i-1].box.width)<2,'discontinuous resize');
    for(const r of native)assert(r.previews===1&&r.pins===1,'native drag failed');
    console.log('PERFORMANCE GATE PASSED: no measured renderer gap >=50ms; bounded DOM reads; continuous resize');
  }
} finally {await host.close();}
