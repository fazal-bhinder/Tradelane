// End-to-end smoke test against a running app (default http://localhost:5173).
// Runs the real flows a person would: sample, classify, review, rules, export.
import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
// read the target value, not the animated text
const kpi = async (label) => Number(await page.locator(`p:text-is("${label}") + p [data-value]`).first().getAttribute("data-value"));

// 0. sign in as the approver (one click, demo users)
await page.goto(BASE);
await page.getByRole("button", { name: /Continue as Rohan/ }).click();
await page.getByRole("heading", { name: "Catalogue" }).waitFor();

// 1. load the sample from the import screen
await page.goto(`${BASE}/import`);
await page.getByRole("button", { name: "Load the 30-product sample" }).click();
await page.getByText("Imported 30 products").waitFor();

// 2. classify the products with no category (keyword match when no AI key is set)
await page.getByRole("button", { name: /Classify \d+ products/ }).click();
await page.getByText(/^Done: \d+ of \d+$/).waitFor({ timeout: 240_000 });

// 3. the catalogue shows its finding and its numbers
await page.goto(BASE);
await page.getByRole("heading", { name: "Catalogue" }).waitFor();
const listing = await kpi("Lanes worth listing");
assert.ok(listing > 0, "some lanes should be worth listing");

// 4. approve the top lane from the keyboard, reject the next
await page.goto(`${BASE}/review`);
const waitingBefore = Number(await page.locator("header:has(h2:text-is('Waiting')) span").innerText());
await page.getByRole("button", { name: /Approve to list/ }).waitFor();
await page.keyboard.press("a");
await page.waitForFunction((n) => Number(document.querySelector("section header span.num")?.textContent) === n - 1, waitingBefore);
await page.getByRole("button", { name: /^Reject/ }).click();
await page.waitForFunction((n) => Number(document.querySelector("section header span.num")?.textContent) === n - 2, waitingBefore);
const download = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download" }).first().click()]).then(([d]) => d);
assert.match(download.suggestedFilename(), /tradelane-.*-approved\.csv/);

// 5. a stricter target margin lists fewer lanes; reset restores it
await page.goto(`${BASE}/rules`);
const target = page.getByLabel("Target margin");
await target.fill("35");
await target.press("Enter");
await page.getByRole("button", { name: "Reset" }).waitFor();
await page.goto(BASE);
const stricter = await kpi("Lanes worth listing");
assert.ok(stricter < listing, `35% target should list fewer than ${listing}, got ${stricter}`);
await page.goto(`${BASE}/rules`);
await page.getByRole("button", { name: "Reset" }).click();
await page.getByRole("button", { name: "Reset" }).waitFor({ state: "detached" });

// 6. a product page edits a price and the verdict follows
await page.goto(BASE);
await page.getByRole("link", { name: "Organic cotton crew T-shirt" }).click();
await page.getByRole("tab", { name: /Amazon US/ }).click();
await page.getByLabel(/Shelf price \(USD/).waitFor();
const targetPrice = (await page.locator("dt:text-is('Price for target margin') + dd").innerText()).replace(/[^\d.]/g, "");
await page.getByLabel(/Shelf price \(USD/).fill(targetPrice);
await page.getByRole("button", { name: "Update" }).click();
await page.locator("section:has(h2:text-is('Decision')) >> text=List").first().waitFor();

// 7. the analyst opens from anywhere and offers questions about this product
await page.getByRole("button", { name: "Ask about this product" }).click();
await page.getByRole("dialog", { name: "Ask Tradelane" }).getByText(/worth listing anywhere/).waitFor();
await page.keyboard.press("Escape");

// 8. every change above is in the activity log, with who made it
await page.goto(`${BASE}/activity`);
await page.getByText(/approved/).first().waitFor();

assert.deepEqual(errors, [], `page errors: ${errors.join("; ")}`);
console.log(`smoke ok: ${listing} lanes listed at 20%, ${stricter} at 35%`);
await browser.close();
