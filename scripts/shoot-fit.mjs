// 화면 맞춤 check: the projector at 1920x1080 shrunk into the top 75% (?fit=100x75), then one ↓ key.
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
const p = await b.newPage();
await p.setViewport({ width: 1920, height: 1080 });
const out = process.argv[2];
await p.goto('http://localhost:3100/p?fit=100x75');
await new Promise((r) => setTimeout(r, 3000));
await p.screenshot({ path: `${out}/fit-75.png` });
await p.keyboard.press('ArrowDown');
await new Promise((r) => setTimeout(r, 400));
await p.screenshot({ path: `${out}/fit-74-keys.png` });
await b.close();
