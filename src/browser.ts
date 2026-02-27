/**
 * Browser launcher and manager
 */

import type { CDPSession } from "./cdp";
import { Page } from "./page";

interface BrowserOptions {
	headless?: boolean;
	executablePath?: string;
	args?: string[];
}

interface CDPTarget {
	id: string;
	type: string;
	title: string;
	url: string;
	webSocketDebuggerUrl?: string;
}

interface CDPVersionInfo {
	webSocketDebuggerUrl: string;
}

export class Browser {
	private process: Subprocess | null = null;
	private cdp: CDPSession | null = null;
	private debuggerUrl: string;
	private _pages: Page[] = [];

	private constructor(debuggerUrl: string) {
		this.debuggerUrl = debuggerUrl;
	}

	static async launch(options: BrowserOptions = {}): Promise<Browser> {
		const {
			headless = true,
			executablePath = await findChromium(),
			args = [],
		} = options;

		const port = await getRandomPort();
		const userDataDir = `/tmp/thrall-${Date.now()}`;

		const launchArgs = [
			`--remote-debugging-port=${port}`,
			`--user-data-dir=${userDataDir}`,
			"--no-first-run",
			"--no-default-browser-check",
			"--disable-background-networking",
			"--disable-background-timer-throttling",
			"--disable-backgrounding-occluded-windows",
			"--disable-breakpad",
			"--disable-component-extensions-with-background-pages",
			"--disable-component-update",
			"--disable-default-apps",
			"--disable-dev-shm-usage",
			"--disable-extensions",
			"--disable-hang-monitor",
			"--disable-ipc-flooding-protection",
			"--disable-popup-blocking",
			"--disable-prompt-on-repost",
			"--disable-renderer-backgrounding",
			"--disable-sync",
			"--enable-features=NetworkService,NetworkServiceInProcess",
			"--force-color-profile=srgb",
			"--metrics-recording-only",
			...(headless ? ["--headless=new"] : []),
			...args,
			"about:blank",
		];

		const proc = Bun.spawn([executablePath, ...launchArgs], {
			stdout: "ignore",
			stderr: "ignore",
		});

		// Wait for CDP to be ready
		const debuggerUrl = `http://127.0.0.1:${port}`;
		await waitForCDP(debuggerUrl);

		const browser = new Browser(debuggerUrl);
		browser.process = proc;

		return browser;
	}

	async newPage(): Promise<Page> {
		// Create new target via CDP
		const response = await fetch(`${this.debuggerUrl}/json/new?about:blank`, {
			method: "PUT",
		});
		const text = await response.text();

		let target: CDPTarget;
		try {
			target = JSON.parse(text);
		} catch {
			throw new Error(`Failed to create new page. Response: ${text}`);
		}

		if (!target.webSocketDebuggerUrl) {
			throw new Error("Failed to get WebSocket debugger URL for new page");
		}

		const page = await Page.create(target.webSocketDebuggerUrl);
		this._pages.push(page);
		return page;
	}

	async pages(): Promise<Page[]> {
		return this._pages;
	}

	async close() {
		for (const page of this._pages) {
			await page.close();
		}
		this._pages = [];

		if (this.process) {
			this.process.kill();
			await this.process.exited;
			this.process = null;
		}
	}
}

async function findChromium(): Promise<string> {
	// Try which command first (most reliable)
	for (const bin of [
		"chromium",
		"google-chrome",
		"chromium-browser",
		"brave-browser",
		"brave",
	]) {
		try {
			const result = await Bun.$`which ${bin}`.quiet();
			const found = result.text().trim();
			if (found && !found.includes("not found")) return found;
		} catch {
			// Not found, try next
		}
	}

	const paths = [
		// Linux
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser",
		"/usr/bin/google-chrome",
		"/usr/bin/google-chrome-stable",
		"/usr/bin/brave-browser",
		"/usr/bin/brave",
		// macOS
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/Applications/Chromium.app/Contents/MacOS/Chromium",
		"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
		// Common Nix paths
		"/etc/profiles/per-user/louis/bin/chromium",
		"/etc/profiles/per-user/louis/bin/brave",
		`${process.env.HOME}/.nix-profile/bin/chromium`,
		`${process.env.HOME}/.nix-profile/bin/google-chrome-stable`,
		`${process.env.HOME}/.nix-profile/bin/brave`,
	];

	for (const path of paths) {
		const file = Bun.file(path);
		if (await file.exists()) {
			return path;
		}
	}

	throw new Error(
		"Could not find Chromium or Brave. Please install a Chromium-based browser or provide executablePath.",
	);
}

async function getRandomPort(): Promise<number> {
	// Use Bun's native server to find an available port
	const server = Bun.serve({
		port: 0,
		fetch: () => new Response(),
	});
	const port = server.port!;
	server.stop();
	return port;
}

async function waitForCDP(url: string, timeout = 10000): Promise<void> {
	const start = Date.now();

	while (Date.now() - start < timeout) {
		try {
			const response = await fetch(`${url}/json/version`);
			if (response.ok) return;
		} catch {
			// Not ready yet
		}
		await Bun.sleep(50);
	}

	throw new Error(`Timed out waiting for CDP at ${url}`);
}

type Subprocess = ReturnType<typeof Bun.spawn>;
