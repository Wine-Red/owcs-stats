import { access } from 'node:fs/promises';
import { chromium } from 'playwright-core';
export const launchBrowser = async () => {
  const candidates = [process.env.CHROME_PATH,
    `${process.env.LOCALAPPDATA || ''}/Google/Chrome/Application/chrome.exe`,
    `${process.env.LOCALAPPDATA || ''}/Microsoft/Edge/Application/msedge.exe`,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  for (const executablePath of candidates) {
    try { await access(executablePath); } catch { continue; }
    return chromium.launch({ executablePath, headless: true, args: process.env.CI ? ['--no-sandbox'] : [] });
  }
  throw new Error('未找到 Chrome/Edge；可通过 CHROME_PATH 指定浏览器');
};
