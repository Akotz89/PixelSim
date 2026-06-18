const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });

  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(pathToFileURL(path.join(root, "index.html")).href);
  await page.waitForSelector("#game-webgpu");

  const collapsed = await page.locator("#ui-menu").evaluate((menu) => ({
    ariaHidden: menu.getAttribute("aria-hidden"),
    inert: menu.hasAttribute("inert"),
    pointerEvents: getComputedStyle(menu).pointerEvents,
    transform: getComputedStyle(menu).transform,
    width: menu.getBoundingClientRect().width
  }));

  assert.strictEqual(collapsed.ariaHidden, "true", "mobile menu should be hidden by default");
  assert.strictEqual(collapsed.inert, true, "mobile menu should be inert while collapsed");
  assert.strictEqual(collapsed.pointerEvents, "none", "collapsed mobile menu should not intercept touches");
  assert.ok(collapsed.transform !== "none", "collapsed mobile menu should be translated off-canvas");
  assert.ok(collapsed.width <= 390, "mobile menu should fit within the viewport width");

  const touchAction = await page.locator("#game-webgpu").evaluate((canvas) => getComputedStyle(canvas).touchAction);
  assert.strictEqual(touchAction, "none", "canvas should opt out of browser touch gestures");

  await page.evaluate(() => setMenuOpen(true));
  const expanded = await page.locator("#ui-menu").evaluate((menu) => ({
    ariaHidden: menu.getAttribute("aria-hidden"),
    inert: menu.hasAttribute("inert"),
    pointerEvents: getComputedStyle(menu).pointerEvents,
    width: menu.getBoundingClientRect().width
  }));

  assert.strictEqual(expanded.ariaHidden, "false", "menu toggle should open the mobile menu");
  assert.strictEqual(expanded.inert, false, "expanded mobile menu should be interactive");
  assert.strictEqual(expanded.pointerEvents, "auto", "expanded mobile menu should accept touches");
  assert.ok(expanded.width <= 390, "expanded mobile menu should stay within the viewport width");
  assert.deepStrictEqual(errors, [], "page should not emit console or runtime errors");

  await browser.close();
  console.log("mobile layout checks passed");
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
