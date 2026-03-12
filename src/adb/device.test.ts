import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Device } from "./device";
import {
	parseHierarchy,
	parseBounds,
	findMatch,
	findAllMatches,
	type UINode,
} from "./element";

// --- Unit tests for XML parsing (no device needed) ---

describe("parseBounds", () => {
	test("parses [x1,y1][x2,y2] format", () => {
		expect(parseBounds("[0,96][1080,248]")).toEqual({
			x1: 0,
			y1: 96,
			x2: 1080,
			y2: 248,
		});
	});

	test("returns zeros for invalid input", () => {
		expect(parseBounds("invalid")).toEqual({ x1: 0, y1: 0, x2: 0, y2: 0 });
	});
});

describe("parseHierarchy", () => {
	const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <node index="0" text="Settings" resource-id="com.android.settings:id/title" class="android.widget.TextView" content-desc="" bounds="[48,96][300,148]" />
  <node index="1" text="" resource-id="" class="android.widget.FrameLayout" content-desc="" bounds="[0,0][1080,1920]">
    <node index="0" text="Search" resource-id="com.android.settings:id/search" class="android.widget.EditText" content-desc="Search settings" bounds="[100,200][980,280]" />
  </node>
</hierarchy>`;

	test("parses nodes from XML", () => {
		const nodes = parseHierarchy(sampleXml);
		// hierarchy root + 2 children
		expect(nodes.length).toBe(1); // <hierarchy> is the root
		const hierarchy = nodes[0];
		expect(hierarchy.children.length).toBe(2);
	});

	test("extracts text attribute", () => {
		const nodes = parseHierarchy(sampleXml);
		const settings = nodes[0].children[0];
		expect(settings.text).toBe("Settings");
	});

	test("extracts resource-id", () => {
		const nodes = parseHierarchy(sampleXml);
		const settings = nodes[0].children[0];
		expect(settings.resourceId).toBe("com.android.settings:id/title");
	});

	test("parses nested nodes", () => {
		const nodes = parseHierarchy(sampleXml);
		const frame = nodes[0].children[1];
		expect(frame.children.length).toBe(1);
		expect(frame.children[0].text).toBe("Search");
		expect(frame.children[0].contentDesc).toBe("Search settings");
	});

	test("computes center from bounds", () => {
		const nodes = parseHierarchy(sampleXml);
		const settings = nodes[0].children[0];
		const center = settings.center();
		expect(center).toEqual({ x: 174, y: 122 });
	});
});

describe("findMatch", () => {
	const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <node index="0" text="Settings" resource-id="com.android.settings:id/title" class="android.widget.TextView" content-desc="" bounds="[48,96][300,148]" />
  <node index="1" text="Wi-Fi" resource-id="com.android.settings:id/wifi" class="android.widget.TextView" content-desc="Wi-Fi settings" bounds="[48,200][300,252]" />
</hierarchy>`;

	let nodes: UINode[];

	beforeAll(() => {
		nodes = parseHierarchy(sampleXml);
	});

	test("finds by text (partial)", () => {
		const result = findMatch(nodes, { text: "Wi" });
		expect(result).not.toBeNull();
		expect(result!.text).toBe("Wi-Fi");
	});

	test("finds by text (exact)", () => {
		const result = findMatch(nodes, { text: "Wi", exact: true });
		expect(result).toBeNull();

		const exact = findMatch(nodes, { text: "Wi-Fi", exact: true });
		expect(exact).not.toBeNull();
	});

	test("finds by resource id", () => {
		const result = findMatch(nodes, { id: "wifi" });
		expect(result).not.toBeNull();
		expect(result!.text).toBe("Wi-Fi");
	});

	test("finds by content-desc", () => {
		const result = findMatch(nodes, { contentDesc: "Wi-Fi settings" });
		expect(result).not.toBeNull();
	});

	test("returns null when no match", () => {
		expect(findMatch(nodes, { text: "Bluetooth" })).toBeNull();
	});
});

describe("findAllMatches", () => {
	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <node index="0" text="Item" resource-id="" class="android.widget.TextView" content-desc="" bounds="[0,0][100,50]" />
  <node index="1" text="Item" resource-id="" class="android.widget.TextView" content-desc="" bounds="[0,50][100,100]" />
  <node index="2" text="Other" resource-id="" class="android.widget.Button" content-desc="" bounds="[0,100][100,150]" />
</hierarchy>`;

	test("returns all matching nodes", () => {
		const nodes = parseHierarchy(xml);
		const results = findAllMatches(nodes, { text: "Item" });
		expect(results.length).toBe(2);
	});

	test("finds by className", () => {
		const nodes = parseHierarchy(xml);
		const results = findAllMatches(nodes, { className: "TextView" });
		expect(results.length).toBe(2);
	});
});

// --- Device integration tests (require connected device/emulator) ---

async function hasAdbDevice(): Promise<boolean> {
	try {
		const result = await Bun.$`adb devices`.quiet().nothrow();
		if (result.exitCode !== 0) return false;
		const lines = result.text().trim().split("\n").slice(1);
		return lines.some((l) => l.includes("device"));
	} catch {
		return false;
	}
}

const deviceAvailable = await hasAdbDevice();

describe.skipIf(!deviceAvailable)("Device (integration)", () => {
	let device: Device;

	beforeAll(async () => {
		device = await Device.connect();
	}, 15000);

	afterAll(async () => {
		await device.close();
	});

	test("connect returns a Device", () => {
		expect(device).toBeInstanceOf(Device);
	});

	test("shell executes command", async () => {
		const result = await device.shell("echo hello");
		expect(result).toBe("hello");
	});

	test("screenshot returns PNG buffer", async () => {
		const buffer = await device.screenshot();
		expect(buffer.length).toBeGreaterThan(0);
		// PNG magic bytes
		expect(buffer[0]).toBe(0x89);
		expect(buffer[1]).toBe(0x50); // P
		expect(buffer[2]).toBe(0x4e); // N
		expect(buffer[3]).toBe(0x47); // G
	});

	test("hierarchy returns UI nodes", async () => {
		const nodes = await device.hierarchy();
		expect(nodes.length).toBeGreaterThan(0);
	});

	test("launch and stop Settings app", async () => {
		await device.launch("com.android.settings/.Settings");
		await Bun.sleep(1000);

		const node = await device.findElement({ text: "Network" });
		expect(node).not.toBeNull();

		await device.stop("com.android.settings");
	}, 15000);

	test("tap element by text", async () => {
		await device.launch("com.android.settings/.Settings");
		await Bun.sleep(1000);

		// Tap on a known settings item
		await device.tap({ text: "Network" });
		await Bun.sleep(500);

		await device.pressKey("BACK");
		await device.stop("com.android.settings");
	}, 15000);

	test("swipe gesture", async () => {
		await device.launch("com.android.settings/.Settings");
		await Bun.sleep(1000);

		// Swipe up
		await device.swipe(540, 1500, 540, 500, 300);
		await Bun.sleep(500);

		await device.stop("com.android.settings");
	}, 15000);

	test("typeText inputs characters", async () => {
		await device.launch("com.android.settings/.Settings");
		await Bun.sleep(1000);

		// Try tapping search if available
		const searchNode = await device.findElement({
			contentDesc: "Search",
		});
		if (searchNode) {
			const { x, y } = searchNode.center();
			await device.tapXY(x, y);
			await Bun.sleep(500);
			await device.typeText("wifi");
			await Bun.sleep(500);
		}

		await device.pressKey("BACK");
		await device.pressKey("BACK");
		await device.stop("com.android.settings");
	}, 15000);

	test("pressKey sends key events", async () => {
		await device.pressKey("HOME");
		await Bun.sleep(500);
		// Should be on home screen — just verify no error
	});

	test("setLocation and clearLocation", async () => {
		// Set mock location to San Francisco — verifies no errors thrown
		await device.setLocation(37.7749, -122.4194);
		await device.clearLocation();
	}, 15000);
});
