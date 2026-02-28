import { launch } from "../../src/index";

const browser = await launch({ headless: false });
const page = await browser.newPage();

// Start recording
console.log("Starting screencast...");
const screencast = await page.startScreencast({
	format: "jpeg",
	quality: 80,
	maxWidth: 1280,
	maxHeight: 720,
});

// Perform some actions
await page.goto("https://example.com");
await Bun.sleep(1000);

await page.goto("https://www.google.com");
await Bun.sleep(1000);

// Type in search box
const searchBox = await page.$('textarea[name="q"]');
if (searchBox) {
	await searchBox.type("Bun JavaScript runtime");
	await Bun.sleep(500);
}

// Stop recording
console.log("Stopping screencast...");
const frames = await screencast.stop();
console.log(`Captured ${frames.length} frames`);

// Save as video (requires ffmpeg)
try {
	await screencast.saveVideo("recording.mp4", { fps: 10 });
	console.log("Saved video to recording.mp4");
} catch (e) {
	console.log("Could not save video (ffmpeg required):", (e as Error).message);

	// Fallback: save individual frames
	await Bun.$`mkdir -p frames`;
	const paths = await screencast.saveFrames("frames");
	console.log(`Saved ${paths.length} frames to frames/`);
}

await browser.close();
