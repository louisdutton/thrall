import { test, expect, beforeAll, afterAll } from "bun:test";
import { launch, Browser, Page, Screencast } from "./index";

let browser: Browser;
let page: Page;

beforeAll(async () => {
	browser = await launch({ headless: true });
	page = await browser.newPage();
});

afterAll(async () => {
	await browser.close();
});

test("startScreencast returns Screencast instance", async () => {
	const screencast = await page.startScreencast();
	expect(screencast).toBeInstanceOf(Screencast);
	expect(screencast.isRecording()).toBe(true);
	await screencast.stop();
});

test("screencast captures frames during navigation", async () => {
	const screencast = await page.startScreencast({
		format: "jpeg",
		quality: 50,
		maxWidth: 640,
		maxHeight: 480,
	});

	await page.goto("https://example.com");
	await Bun.sleep(500);

	const frames = await screencast.stop();
	expect(frames.length).toBeGreaterThan(0);
	expect(screencast.isRecording()).toBe(false);
});

test("screencast frame data is valid", async () => {
	const screencast = await page.startScreencast({ format: "jpeg" });

	await page.goto("https://example.com");
	await Bun.sleep(300);

	const frames = await screencast.stop();
	expect(frames.length).toBeGreaterThan(0);

	const frame = frames[0]!;
	expect(frame.data).toBeInstanceOf(Buffer);
	expect(frame.data.length).toBeGreaterThan(0);
	expect(frame.timestamp).toBeGreaterThan(0);
	expect(frame.metadata).toBeDefined();
	expect(typeof frame.metadata.deviceWidth).toBe("number");
	expect(typeof frame.metadata.deviceHeight).toBe("number");
});

test("screencast frameCount returns correct count", async () => {
	const screencast = await page.startScreencast();

	await page.goto("https://example.com");
	await Bun.sleep(300);

	const count = screencast.frameCount();
	const frames = await screencast.stop();
	expect(count).toBe(frames.length);
});

test("screencast throws when starting twice", async () => {
	const screencast = await page.startScreencast();

	expect(screencast.start()).rejects.toThrow("already recording");

	await screencast.stop();
});

test("screencast throws when stopping without starting", async () => {
	const screencast = await page.startScreencast();
	await screencast.stop();

	expect(screencast.stop()).rejects.toThrow("not recording");
});

test("saveFrames writes frames to disk", async () => {
	const screencast = await page.startScreencast({ format: "jpeg" });

	await page.goto("https://example.com");
	await Bun.sleep(300);

	await screencast.stop();

	const tempDir = `/tmp/thrall-test-frames-${Date.now()}`;
	await Bun.$`mkdir -p ${tempDir}`;

	try {
		const paths = await screencast.saveFrames(tempDir);
		expect(paths.length).toBe(screencast.frameCount());

		for (const path of paths) {
			const file = Bun.file(path);
			expect(await file.exists()).toBe(true);
			expect(file.size).toBeGreaterThan(0);
		}
	} finally {
		await Bun.$`rm -rf ${tempDir}`;
	}
});
