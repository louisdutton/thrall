/**
 * Browser launcher and manager using Bun.WebView
 */

import { Page } from "./page";

interface BrowserOptions {
	executablePath?: string;
	args?: string[];
	width?: number;
	height?: number;
}

export class Browser {
	private _pages: Page[] = [];
	private options: BrowserOptions;

	private constructor(options: BrowserOptions) {
		this.options = options;
	}

	static async launch(options: BrowserOptions = {}): Promise<Browser> {
		const envDefaults = resolveEnvDefaults(process.env);
		const merged: BrowserOptions = {
			executablePath: options.executablePath ?? envDefaults.executablePath,
			args: options.args ?? envDefaults.args,
			width: options.width ?? 1280,
			height: options.height ?? 720,
		};

		return new Browser(merged);
	}

	async newPage(): Promise<Page> {
		const config: Record<string, unknown> = {
			width: this.options.width ?? 1280,
			height: this.options.height ?? 720,
		};

		if (this.options.executablePath) {
			config.backend = {
				type: "chrome",
				path: this.options.executablePath,
				argv: this.options.args,
			};
		}

		const view = new Bun.WebView(config);

		const page = new Page(view);
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
	}
}

export function resolveEnvDefaults(
	env: NodeJS.ProcessEnv,
): Partial<BrowserOptions> {
	const defaults: Partial<BrowserOptions> = {};

	// THRALL_BROWSER -> executablePath
	if (env.THRALL_BROWSER) {
		defaults.executablePath = env.THRALL_BROWSER;
	}

	// THRALL_ARGS -> extra chromium args (comma-separated)
	if (env.THRALL_ARGS) {
		defaults.args = env.THRALL_ARGS.split(",")
			.map((a) => a.trim())
			.filter(Boolean);
	}

	return defaults;
}
