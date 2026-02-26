import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type Browser, launch, type Page } from "./index";

describe("thrall", () => {
	let browser: Browser;
	let page: Page;

	beforeAll(async () => {
		browser = await launch({ headless: true });
		page = await browser.newPage();
	});

	afterAll(async () => {
		await browser.close();
	});

	test("navigates to a page", async () => {
		await page.goto("https://example.com");
		const title = await page.title();
		expect(title).toBe("Example Domain");
	});

	test("gets page content", async () => {
		const content = await page.content();
		expect(content).toContain("Example Domain");
	});

	test("gets current URL", async () => {
		const url = await page.url();
		expect(url).toBe("https://example.com/");
	});

	test("finds elements", async () => {
		const heading = await page.$("h1");
		expect(heading).not.toBeNull();

		const text = await heading!.textContent();
		expect(text).toBe("Example Domain");
	});

	test("finds multiple elements", async () => {
		const paragraphs = await page.$$("p");
		expect(paragraphs.length).toBeGreaterThan(0);
	});

	test("evaluates JavaScript", async () => {
		const result = await page.evaluate(() => {
			return document.querySelectorAll("p").length;
		});
		expect(result).toBeGreaterThan(0);
	});

	test("evaluates with arguments", async () => {
		const result = await page.evaluate((a: number, b: number) => a + b, 2, 3);
		expect(result).toBe(5);
	});

	test("takes screenshots", async () => {
		const buffer = await page.screenshot();
		expect(buffer.length).toBeGreaterThan(0);
		expect(buffer[0]).toBe(0x89); // PNG magic number
		expect(buffer[1]).toBe(0x50);
	});

	test("waits for selector", async () => {
		const element = await page.waitForSelector("h1");
		expect(element).not.toBeNull();
	});

	test("exposes keyboard and mouse", () => {
		expect(page.keyboard).toBeDefined();
		expect(page.mouse).toBeDefined();
	});

	test("gets element attributes", async () => {
		const link = await page.$("a");
		expect(link).not.toBeNull();
		const href = await link!.getAttribute("href");
		expect(href).toContain("iana.org");
	});

	test("checks element visibility", async () => {
		const heading = await page.$("h1");
		expect(heading).not.toBeNull();
		const visible = await heading!.isVisible();
		expect(visible).toBe(true);
	});

	test("getByText finds element by partial text", async () => {
		const element = await page.getByText("Example");
		expect(element).not.toBeNull();
		const text = await element!.textContent();
		expect(text).toContain("Example");
	});

	test("getByText finds element by exact text", async () => {
		const element = await page.getByText("Example Domain", { exact: true });
		expect(element).not.toBeNull();
	});

	test("getByText returns null for non-existent text", async () => {
		const element = await page.getByText("This text does not exist anywhere");
		expect(element).toBeNull();
	});

	test("getAllByText finds multiple elements", async () => {
		// Page has multiple text nodes containing "e" (Example, more, etc)
		const elements = await page.getAllByText("Domain");
		expect(elements.length).toBeGreaterThan(0);
	});

	test("getByRole finds button/link elements", async () => {
		const link = await page.getByRole("link");
		expect(link).not.toBeNull();
		const href = await link!.getAttribute("href");
		expect(href).toContain("iana.org");
	});

	test("getByRole with name filter", async () => {
		const link = await page.getByRole("link", { name: "Learn more" });
		expect(link).not.toBeNull();
	});

	test("getByRole returns null for non-matching name", async () => {
		const link = await page.getByRole("link", { name: "Nonexistent Link" });
		expect(link).toBeNull();
	});

	test("getByText handles text with spaces", async () => {
		// "Example Domain" has a space - this was the original bug
		const element = await page.getByText("Example Domain");
		expect(element).not.toBeNull();
		const text = await element!.textContent();
		expect(text).toBe("Example Domain");
	});

	test("getByText handles partial match with spaces", async () => {
		const element = await page.getByText("ample Dom");
		expect(element).not.toBeNull();
	});
});
