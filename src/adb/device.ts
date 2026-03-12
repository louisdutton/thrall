import {
	type UINode,
	type ElementMatcher,
	parseHierarchy,
	findMatch,
	findAllMatches,
} from "./element";

export class Device {
	private serial: string;

	private constructor(serial: string) {
		this.serial = serial;
	}

	static async connect(serial?: string): Promise<Device> {
		if (serial) {
			// Verify specified device is available
			const result =
				await Bun.$`adb -s ${serial} get-state`.quiet().nothrow();
			if (result.exitCode !== 0) {
				throw new Error(`Device ${serial} not available`);
			}
			return new Device(serial);
		}

		// Use first available device
		const result = await Bun.$`adb devices`.quiet();
		const lines = result.text().trim().split("\n").slice(1);
		const devices = lines
			.map((l) => l.split("\t"))
			.filter(([, state]) => state === "device");

		if (devices.length === 0) {
			throw new Error("No ADB devices connected");
		}

		return new Device(devices[0][0]);
	}

	private adb(args: string[]): string[] {
		return ["-s", this.serial, ...args];
	}

	async launch(component: string): Promise<void> {
		const args = this.adb(["shell", "am", "start", "-n", component]);
		await Bun.$`adb ${args}`.quiet();
	}

	async stop(pkg: string): Promise<void> {
		const args = this.adb(["shell", "am", "force-stop", pkg]);
		await Bun.$`adb ${args}`.quiet();
	}

	async tap(matcher: ElementMatcher): Promise<void> {
		const node = await this.waitFor(matcher);
		const { x, y } = node.center();
		await this.tapXY(x, y);
	}

	async tapXY(x: number, y: number): Promise<void> {
		const args = this.adb(["shell", "input", "tap", String(x), String(y)]);
		await Bun.$`adb ${args}`.quiet();
	}

	async typeText(text: string): Promise<void> {
		// Escape special characters for adb shell
		const escaped = text.replace(/ /g, "%s").replace(/[&|<>]/g, "\\$&");
		const args = this.adb(["shell", "input", "text", escaped]);
		await Bun.$`adb ${args}`.quiet();
	}

	async pressKey(key: string): Promise<void> {
		const keycode = KEY_MAP[key.toUpperCase()] ?? key;
		const args = this.adb(["shell", "input", "keyevent", keycode]);
		await Bun.$`adb ${args}`.quiet();
	}

	async swipe(
		x1: number,
		y1: number,
		x2: number,
		y2: number,
		duration = 300,
	): Promise<void> {
		const args = this.adb([
			"shell",
			"input",
			"swipe",
			String(x1),
			String(y1),
			String(x2),
			String(y2),
			String(duration),
		]);
		await Bun.$`adb ${args}`.quiet();
	}

	async screenshot(path?: string): Promise<Buffer> {
		const args = this.adb(["exec-out", "screencap", "-p"]);
		const result = await Bun.$`adb ${args}`.quiet();
		const buffer = Buffer.from(result.stdout);
		if (path) {
			await Bun.write(path, buffer);
		}
		return buffer;
	}

	async hierarchy(): Promise<UINode[]> {
		const dumpPath = "/sdcard/thrall_dump.xml";
		const dumpArgs = this.adb(["shell", "uiautomator", "dump", dumpPath]);
		await Bun.$`adb ${dumpArgs}`.quiet();
		const catArgs = this.adb(["shell", "cat", dumpPath]);
		const result = await Bun.$`adb ${catArgs}`.quiet();
		const xml = result.text();
		if (!xml.includes("<?xml")) {
			throw new Error("Failed to dump UI hierarchy");
		}
		return parseHierarchy(xml);
	}

	async findElement(matcher: ElementMatcher): Promise<UINode | null> {
		const nodes = await this.hierarchy();
		return findMatch(nodes, matcher);
	}

	async findElements(matcher: ElementMatcher): Promise<UINode[]> {
		const nodes = await this.hierarchy();
		return findAllMatches(nodes, matcher);
	}

	async waitFor(matcher: ElementMatcher, timeout = 30000): Promise<UINode> {
		const start = Date.now();

		while (Date.now() - start < timeout) {
			const node = await this.findElement(matcher);
			if (node) return node;
			await Bun.sleep(100);
		}

		throw new Error(
			`Timeout waiting for element: ${JSON.stringify(matcher)}`,
		);
	}

	async assertVisible(matcher: ElementMatcher): Promise<UINode> {
		const node = await this.findElement(matcher);
		if (!node) {
			throw new Error(
				`Element not visible: ${JSON.stringify(matcher)}`,
			);
		}
		return node;
	}

	async shell(cmd: string): Promise<string> {
		const args = this.adb(["shell", cmd]);
		const result = await Bun.$`adb ${args}`.quiet();
		return result.text().trim();
	}

	async setLocation(lat: number, lng: number): Promise<void> {
		const provider = "gps";
		// Grant mock location permission to the shell
		const grantArgs = this.adb([
			"shell",
			"appops",
			"set",
			"com.android.shell",
			"android:mock_location",
			"allow",
		]);
		await Bun.$`adb ${grantArgs}`.quiet();

		const addArgs = this.adb([
			"shell",
			"cmd",
			"location",
			"providers",
			"add-test-provider",
			provider,
		]);
		const enableArgs = this.adb([
			"shell",
			"cmd",
			"location",
			"providers",
			"set-test-provider-enabled",
			provider,
			"true",
		]);
		const setArgs = this.adb([
			"shell",
			"cmd",
			"location",
			"providers",
			"set-test-provider-location",
			provider,
			"--location",
			`${lat},${lng}`,
		]);
		await Bun.$`adb ${addArgs}`.quiet().nothrow();
		await Bun.$`adb ${enableArgs}`.quiet();
		await Bun.$`adb ${setArgs}`.quiet();
	}

	async clearLocation(): Promise<void> {
		const provider = "gps";
		const disableArgs = this.adb([
			"shell",
			"cmd",
			"location",
			"providers",
			"set-test-provider-enabled",
			provider,
			"false",
		]);
		const removeArgs = this.adb([
			"shell",
			"cmd",
			"location",
			"providers",
			"remove-test-provider",
			provider,
		]);
		await Bun.$`adb ${disableArgs}`.quiet().nothrow();
		await Bun.$`adb ${removeArgs}`.quiet().nothrow();
	}

	async close(): Promise<void> {
		// No persistent connection to clean up when shelling out to adb
	}
}

const KEY_MAP: Record<string, string> = {
	HOME: "KEYCODE_HOME",
	BACK: "KEYCODE_BACK",
	ENTER: "KEYCODE_ENTER",
	DELETE: "KEYCODE_DEL",
	TAB: "KEYCODE_TAB",
	ESCAPE: "KEYCODE_ESCAPE",
	UP: "KEYCODE_DPAD_UP",
	DOWN: "KEYCODE_DPAD_DOWN",
	LEFT: "KEYCODE_DPAD_LEFT",
	RIGHT: "KEYCODE_DPAD_RIGHT",
	POWER: "KEYCODE_POWER",
	VOLUME_UP: "KEYCODE_VOLUME_UP",
	VOLUME_DOWN: "KEYCODE_VOLUME_DOWN",
	MENU: "KEYCODE_MENU",
	SEARCH: "KEYCODE_SEARCH",
	APP_SWITCH: "KEYCODE_APP_SWITCH",
};
