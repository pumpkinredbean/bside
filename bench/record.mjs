// Record the replay player to a video via playwright-core + installed Chrome.
// Usage: node bench/record.mjs [seconds]
import { chromium } from "playwright-core";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const BENCH = dirname(fileURLToPath(import.meta.url));
const secs = +(process.argv[2] || 112);

const browser = await chromium.launch({ channel: "chrome", headless: false });
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  recordVideo: { dir: join(BENCH, "video"), size: { width: 1600, height: 1000 } },
});
const page = await ctx.newPage();
await page.goto("file://" + join(BENCH, "player.html"));
console.log(`recording ${secs}s …`);
await page.waitForTimeout(secs * 1000);
await ctx.close(); // finalizes the .webm
await browser.close();
console.log("saved to bench/video/");
