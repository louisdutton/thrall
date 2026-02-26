import { launch } from "../../src/index";

const browser = await launch({ headless: true });
const page = await browser.newPage();

// Navigate to a page
await page.goto("https://example.com");
console.log("Title:", await page.title());
console.log("URL:", await page.url());

// Find elements
const heading = await page.$("h1");
if (heading) {
	console.log("Heading:", await heading.textContent());
}

// Query multiple elements
const paragraphs = await page.$$("p");
console.log("Paragraphs:", paragraphs.length);

// Evaluate JavaScript in the page
const linkCount = await page.evaluate(
	() => document.querySelectorAll("a").length,
);
console.log("Links:", linkCount);

// Take a screenshot
await page.screenshot({ path: "screenshot.png" });
console.log("Screenshot saved to screenshot.png");

await browser.close();
