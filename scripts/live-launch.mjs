import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
export async function launch(profile) {
 const child=spawn(process.env.OBSIDIAN_EXECUTABLE ?? '/Applications/Obsidian.app/Contents/MacOS/Obsidian', [`--user-data-dir=${profile}`,'--remote-debugging-port=0'],{stdio:['ignore','pipe','pipe']});
 let logs='';
 const endpoint=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{child.kill();reject(new Error('CDP launch timeout: '+logs));},30000);
   const read=data=>{logs+=data.toString(); const match=logs.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}};
   child.stdout.on('data',read);child.stderr.on('data',read);child.on('error',reject);
 });
 const browser=await chromium.connectOverCDP(endpoint);
 const context=browser.contexts()[0];
 let page=context.pages()[0]; if(!page) page=await context.waitForEvent('page');
 await page.waitForLoadState('domcontentloaded');
 return {browser,page,logs:()=>logs,close:async()=>{
   // A renderer reload can leave Electron's CDP close handshake pending.
   let timer;
   try { await Promise.race([browser.close(),new Promise(resolve=>{timer=setTimeout(resolve,3000);})]); }
   finally {
     clearTimeout(timer); child.kill('SIGTERM');
     if(child.exitCode===null) await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>{timer=setTimeout(resolve,3000);})]);
     clearTimeout(timer);if(child.exitCode===null)child.kill('SIGKILL');
     child.stdout.destroy();child.stderr.destroy();child.unref();
   }
 }};
}
