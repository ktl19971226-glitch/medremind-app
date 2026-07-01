const { chromium } = require("playwright");
const path = require("path");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <style>
          html, body {
            width: 1024px;
            height: 1024px;
            margin: 0;
          }
          body {
            display: grid;
            place-items: center;
            background:
              linear-gradient(145deg, #0b5f59 0%, #0f766e 48%, #d7a23a 100%);
            font-family: -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif;
          }
          .mark {
            display: grid;
            place-items: center;
            width: 690px;
            height: 690px;
            border-radius: 168px;
            background: rgba(255, 255, 255, 0.94);
            box-shadow: 0 44px 100px rgba(0,0,0,0.22);
            color: #101418;
            text-align: center;
          }
          .main {
            margin-top: -28px;
            font-size: 210px;
            font-weight: 950;
            line-height: 1;
            letter-spacing: 0;
          }
          .sub {
            margin-top: 28px;
            font-size: 72px;
            font-weight: 900;
            color: #0b5f59;
            letter-spacing: 0;
          }
        </style>
      </head>
      <body>
        <div class="mark">
          <div>
            <div class="main">賺</div>
            <div class="sub">AI 記帳</div>
          </div>
        </div>
      </body>
    </html>
  `);
  await page.screenshot({
    path: path.join(__dirname, "..", "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset", "AppIcon-512@2x.png"),
    clip: { x: 0, y: 0, width: 1024, height: 1024 }
  });
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
