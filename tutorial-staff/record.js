const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const W = 390, H = 844;
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
    recordVideo: { dir: path.join(__dirname, 'raw'), size: { width: W, height: H } },
  });
  const page = await context.newPage();
  await page.goto('file://' + path.join(__dirname, 'walkthrough.html'));

  // wait until the timeline signals completion (max 90s)
  await page.waitForFunction('window.__done === true', null, { timeout: 90000 });
  await page.waitForTimeout(300);

  await context.close(); // finalizes the webm
  await browser.close();

  const fs = require('fs');
  const files = fs.readdirSync(path.join(__dirname, 'raw')).filter(f => f.endsWith('.webm'));
  console.log('VIDEO:' + path.join(__dirname, 'raw', files[files.length - 1]));
})().catch(e => { console.error(e); process.exit(1); });
