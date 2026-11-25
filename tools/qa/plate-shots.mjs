// Capture the plate game at given video times, full resolution, via headless Chrome (CDP).
// Usage: node tools/qa/plate-shots.mjs <outDir> 0.5 14 28 34
// Needs the dev server on http://localhost:5173. Writes <outDir>/ours_<t>.png (1080x2340 canvas).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const [out, ...times] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const port = 9344;
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, '--autoplay-policy=no-user-gesture-required',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=540,1170',
  `--user-data-dir=${out}/.chrome-prof`, 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 60 && !ws; i++) {
  try {
    const page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
    if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
  } catch { /* not up yet */ }
  await sleep(250);
}
if (ws.readyState !== 1) await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') console.log('exception:', JSON.stringify(d.params.exceptionDetails).slice(0, 300));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
console.log('connected'); await send('Runtime.enable');
await send('Page.enable');

for (const t of times) {
  await send('Page.navigate', { url: `http://localhost:5173/?game&t=${t}` });
  console.log('nav', t);
  // wait until the plate is frozen on the frame and textures uploaded
  for (let i = 0; i < 100; i++) {
    const ok = await ev(`!!(window.plate && Math.abs(window.plate.time - ${t}) < 0.05)`);
    if (ok) { console.log('frozen'); break; }
    if (i % 10 === 0) console.log('state', await ev('JSON.stringify({p:!!window.plate,t:window.plate?.time,s:window.plate?.state,h:location.href})'));
    await sleep(200);
  }
  await sleep(1200);
  const data = await ev(`(async()=>{const c=document.querySelector('#stage-wrap canvas');return c.toDataURL('image/png').split(',')[1];})()`);
  if (!data) { console.log('no canvas at', t); continue; }
  writeFileSync(`${out}/ours_${t}.png`, Buffer.from(data, 'base64'));
  console.log('shot', t);
}
ws.close();
chrome.kill();
process.exit(0);
