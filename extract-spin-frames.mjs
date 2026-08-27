// Extract a 360° photo-spin set from a spin video.
// No ffmpeg required: this tool serves the video over a tiny local HTTP
// server, decodes it in headless Chrome, and writes N evenly-spaced JPEG
// frames to images/spins/demo/frame_01..N.jpg.
//
// Usage:
//   node extract-spin-frames.mjs [videoPath] [frameCount]
// Examples:
//   node extract-spin-frames.mjs sp_20260518_720p_30f_20260518_031331.mp4
//   node extract-spin-frames.mjs my-spin.mp4 24
//
// After extracting, point the product's spin at the frames (ext: 'jpg').
import { spawn } from 'node:child_process';
import http from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';

const videoPath = path.resolve(process.argv[2] || 'sp_20260518_720p_30f_20260518_031331.mp4');
const FRAMES = Number(process.argv[3]) || 36;
const OUT_DIR = path.resolve('images/spins/demo');

if (!existsSync(videoPath)) {
  console.error(`Video not found: ${videoPath}`);
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });

const videoBuf = readFileSync(videoPath);
const videoName = path.basename(videoPath);

// Minimal local server (full-body responses; Chrome can still seek).
const server = http.createServer((req, res) => {
  if (req.url === '/video') {
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': videoBuf.length,
      'Accept-Ranges': 'bytes',
    });
    res.end(videoBuf);
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html><body id="b"></body></html>');
  }
});

const PORT = await new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});
const VIDEO_URL = `http://127.0.0.1:${PORT}/video`;
const BASE_URL = `http://127.0.0.1:${PORT}/`;

const DEBUG_PORT = 9337;
const profileDir = mkdtempSync(path.join(tmpdir(), 'chrome-extract-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profileDir}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let tab = null;
for (let i = 0; i < 40; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(BASE_URL)}`, { method: 'PUT' });
    tab = await res.json();
    break;
  } catch {
    await sleep(250);
  }
}
if (!tab) {
  console.error('FAIL: could not reach headless Chrome');
  process.exit(1);
}

const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let msgId = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++msgId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send('Runtime.enable');
await send('Page.enable');
await sleep(1500);

const expression = `(async () => {
  const v = document.createElement('video');
  v.muted = true;
  v.preload = 'auto';
  v.playsInline = true;
  v.src = '${VIDEO_URL}';
  document.body.appendChild(v);
  await new Promise((res, rej) => {
    v.onloadedmetadata = res;
    v.onerror = () => rej(new Error('video failed to load'));
    setTimeout(() => rej(new Error('metadata timeout')), 15000);
  });
  const dur = v.duration;
  const scale = Math.min(1, 900 / v.videoWidth);
  const W = Math.round(v.videoWidth * scale);
  const H = Math.round(v.videoHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const results = [];
  for (let i = 0; i < ${FRAMES}; i++) {
    const target = ((i + 0.5) / ${FRAMES}) * dur;
    v.currentTime = target;
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      if (Math.abs(v.currentTime - target) < 0.03 && v.readyState >= 2) break;
      await new Promise((r) => setTimeout(r, 40));
    }
    await new Promise((r) => setTimeout(r, 80));
    ctx.drawImage(v, 0, 0, W, H);
    results.push({ i, dur, W, H, dataUrl: canvas.toDataURL('image/jpeg', 0.88) });
  }
  return results;
})()`;

const res = await Promise.race([
  send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
  new Promise((_, rej) => setTimeout(() => rej(new Error('EVAL TIMED OUT')), 90000)),
]);

if (res.result && res.result.exceptionDetails) {
  console.error('EVAL ERROR:', JSON.stringify(res.result.exceptionDetails).slice(0, 500));
  process.exit(1);
}
const results = res.result && res.result.result ? res.result.result.value : null;
if (!results || !results.length) {
  console.error('No frames returned');
  process.exit(1);
}

for (const f of results) {
  const b64 = f.dataUrl.split(',')[1];
  writeFileSync(
    path.join(OUT_DIR, `frame_${String(f.i + 1).padStart(2, '0')}.jpg`),
    Buffer.from(b64, 'base64')
  );
}

console.log(`OK video=${videoName} (${results[0].W}x${results[0].H}, ${results[0].dur}s)`);
console.log(`Wrote ${results.length} frames to ${OUT_DIR}/frame_01..${String(results.length).padStart(2, '0')}.jpg`);
console.log(`Next: set the product's spin ext to 'jpg' (I can do this, or edit data/db.json).`);

ws.close();
chrome.kill();
server.close();
process.exit(0);
