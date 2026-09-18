import { launch } from './live-launch.mjs';
import { setup } from './live-setup.mjs';
const f=await setup(); console.log(f.root);
const app=await launch(f.profile);
try {
 const page=app.page; await page.waitForTimeout(3000);
 console.log(app.logs()); console.log('URL',page.url()); console.log((await page.locator('body').innerText()).slice(0,6000));
 console.log(await page.evaluate(()=>({app:!!window.app,plugins:window.app?.plugins?.enabledPlugins?[...window.app.plugins.enabledPlugins]:[]})));
 await page.screenshot({path:f.root+'/probe.png'});
} finally { await app.close(); }
