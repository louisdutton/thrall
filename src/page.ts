/**
 * Page - represents a browser tab
 */

import { CDPSession } from "./cdp";
import { ElementHandle } from "./element";
import { Keyboard } from "./keyboard";
import { Mouse } from "./mouse";

interface NavigateOptions {
	timeout?: number;
	waitUntil?: "load" | "domcontentloaded" | "networkidle";
}

interface WaitForSelectorOptions {
	timeout?: number;
	visible?: boolean;
	hidden?: boolean;
}

interface ScreenshotOptions {
	path?: string;
	fullPage?: boolean;
	type?: "png" | "jpeg" | "webp";
	quality?: number;
}

export class Page {
	private cdp: CDPSession;
	private targetId: string | null = null;

	readonly keyboard: Keyboard;
	readonly mouse: Mouse;

	private constructor(cdp: CDPSession) {
		this.cdp = cdp;
		this.keyboard = new Keyboard(cdp);
		this.mouse = new Mouse(cdp);
	}

	static async create(wsUrl: string): Promise<Page> {
		const cdp = new CDPSession(wsUrl);
		const page = new Page(cdp);

		// Enable necessary domains
		await Promise.all([
			cdp.send("Page.enable"),
			cdp.send("Runtime.enable"),
			cdp.send("DOM.enable"),
			cdp.send("Network.enable"),
		]);

		return page;
	}

	async goto(url: string, options: NavigateOptions = {}): Promise<void> {
		const { timeout = 30000, waitUntil = "load" } = options;

		const eventName =
			waitUntil === "domcontentloaded"
				? "Page.domContentEventFired"
				: "Page.loadEventFired";

		let timer: Timer;

		const loadPromise = new Promise<void>((resolve) => {
			const handler = () => {
				this.cdp.off(eventName, handler);
				resolve();
			};
			this.cdp.on(eventName, handler);
		});

		await this.cdp.send("Page.navigate", { url });

		const timeoutPromise = new Promise<never>((_, reject) => {
			timer = setTimeout(
				() => reject(new Error(`Navigation timeout after ${timeout}ms`)),
				timeout,
			);
		});

		try {
			await Promise.race([loadPromise, timeoutPromise]);
		} finally {
			clearTimeout(timer!);
		}
	}

	async content(): Promise<string> {
		const result = await this.cdp.send<{ result: { value: string } }>(
			"Runtime.evaluate",
			{ expression: "document.documentElement.outerHTML" },
		);
		return result.result.value;
	}

	async title(): Promise<string> {
		const result = await this.cdp.send<{ result: { value: string } }>(
			"Runtime.evaluate",
			{ expression: "document.title" },
		);
		return result.result.value;
	}

	async url(): Promise<string> {
		const result = await this.cdp.send<{ result: { value: string } }>(
			"Runtime.evaluate",
			{ expression: "window.location.href" },
		);
		return result.result.value;
	}

	async $(selector: string): Promise<ElementHandle | null> {
		const { root } = await this.cdp.send<{ root: { nodeId: number } }>(
			"DOM.getDocument",
		);
		const { nodeId } = await this.cdp.send<{ nodeId: number }>(
			"DOM.querySelector",
			{
				nodeId: root.nodeId,
				selector,
			},
		);

		if (nodeId === 0) return null;
		return new ElementHandle(this.cdp, nodeId);
	}

	async $$(selector: string): Promise<ElementHandle[]> {
		const { root } = await this.cdp.send<{ root: { nodeId: number } }>(
			"DOM.getDocument",
		);
		const { nodeIds } = await this.cdp.send<{ nodeIds: number[] }>(
			"DOM.querySelectorAll",
			{
				nodeId: root.nodeId,
				selector,
			},
		);

		return nodeIds.map((nodeId) => new ElementHandle(this.cdp, nodeId));
	}

	async waitForSelector(
		selector: string,
		options: WaitForSelectorOptions = {},
	): Promise<ElementHandle> {
		const { timeout = 30000, visible = false, hidden = false } = options;
		const start = Date.now();

		while (Date.now() - start < timeout) {
			const element = await this.$(selector);

			if (hidden) {
				if (!element) return element as unknown as ElementHandle;
				const isVisible = await element.isVisible();
				if (!isVisible) return element;
			} else if (element) {
				if (!visible) return element;
				const isVisible = await element.isVisible();
				if (isVisible) return element;
			}

			await Bun.sleep(100);
		}

		throw new Error(`Timeout waiting for selector: ${selector}`);
	}

	async click(selector: string): Promise<void> {
		const element = await this.waitForSelector(selector, { visible: true });
		await element.click();
	}

	async type(selector: string, text: string): Promise<void> {
		const element = await this.waitForSelector(selector, { visible: true });
		await element.type(text);
	}

	async fill(selector: string, value: string): Promise<void> {
		const element = await this.waitForSelector(selector, { visible: true });
		await element.fill(value);
	}

	async evaluate<T>(
		fn: string | ((...args: any[]) => T),
		...args: any[]
	): Promise<T> {
		const expression =
			typeof fn === "string"
				? fn
				: `(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(",")})`;

		const result = await this.cdp.send<{
			result: { value: T };
			exceptionDetails?: { exception: { description: string } };
		}>("Runtime.evaluate", {
			expression,
			returnByValue: true,
			awaitPromise: true,
		});

		if (result.exceptionDetails) {
			throw new Error(result.exceptionDetails.exception.description);
		}

		return result.result.value;
	}

	async screenshot(options: ScreenshotOptions = {}): Promise<Buffer> {
		const { fullPage = false, type = "png", quality } = options;

		if (fullPage) {
			const metrics = await this.cdp.send<{
				contentSize: { width: number; height: number };
			}>("Page.getLayoutMetrics");
			await this.cdp.send("Emulation.setDeviceMetricsOverride", {
				width: Math.ceil(metrics.contentSize.width),
				height: Math.ceil(metrics.contentSize.height),
				deviceScaleFactor: 1,
				mobile: false,
			});
		}

		const result = await this.cdp.send<{ data: string }>(
			"Page.captureScreenshot",
			{
				format: type,
				quality: type === "jpeg" ? quality : undefined,
			},
		);

		if (fullPage) {
			await this.cdp.send("Emulation.clearDeviceMetricsOverride");
		}

		const buffer = Buffer.from(result.data, "base64");

		if (options.path) {
			await Bun.write(options.path, buffer);
		}

		return buffer;
	}

	async pdf(options: { path?: string } = {}): Promise<Buffer> {
		const result = await this.cdp.send<{ data: string }>("Page.printToPDF", {
			printBackground: true,
		});

		const buffer = Buffer.from(result.data, "base64");

		if (options.path) {
			await Bun.write(options.path, buffer);
		}

		return buffer;
	}

	async setViewport(width: number, height: number): Promise<void> {
		await this.cdp.send("Emulation.setDeviceMetricsOverride", {
			width,
			height,
			deviceScaleFactor: 1,
			mobile: false,
		});
	}

	async waitForNavigation(options: NavigateOptions = {}): Promise<void> {
		const { timeout = 30000, waitUntil = "load" } = options;

		const eventName =
			waitUntil === "domcontentloaded"
				? "Page.domContentEventFired"
				: "Page.loadEventFired";

		let timer: Timer;

		const loadPromise = new Promise<void>((resolve) => {
			const handler = () => {
				this.cdp.off(eventName, handler);
				resolve();
			};
			this.cdp.on(eventName, handler);
		});

		const timeoutPromise = new Promise<never>((_, reject) => {
			timer = setTimeout(
				() => reject(new Error(`Navigation timeout after ${timeout}ms`)),
				timeout,
			);
		});

		try {
			await Promise.race([loadPromise, timeoutPromise]);
		} finally {
			clearTimeout(timer!);
		}
	}

	async waitForFunction<T>(
		fn: string | (() => T),
		options: { timeout?: number; polling?: number } = {},
	): Promise<T> {
		const { timeout = 30000, polling = 100 } = options;
		const expression = typeof fn === "string" ? fn : `(${fn.toString()})()`;
		const start = Date.now();

		while (Date.now() - start < timeout) {
			const result = await this.cdp.send<{ result: { value: T } }>(
				"Runtime.evaluate",
				{ expression, returnByValue: true },
			);

			if (result.result.value) {
				return result.result.value;
			}

			await Bun.sleep(polling);
		}

		throw new Error(`Timeout waiting for function`);
	}

	async waitForResponse(
		urlOrPredicate: string | RegExp | ((url: string) => boolean),
		options: { timeout?: number } = {},
	): Promise<{ url: string; status: number; headers: Record<string, string> }> {
		const { timeout = 30000 } = options;

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.cdp.off("Network.responseReceived", handler);
				reject(new Error("Timeout waiting for response"));
			}, timeout);

			const handler = (params: {
				response: {
					url: string;
					status: number;
					headers: Record<string, string>;
				};
			}) => {
				const { url, status, headers } = params.response;
				let matches = false;

				if (typeof urlOrPredicate === "string") {
					matches = url.includes(urlOrPredicate);
				} else if (urlOrPredicate instanceof RegExp) {
					matches = urlOrPredicate.test(url);
				} else {
					matches = urlOrPredicate(url);
				}

				if (matches) {
					clearTimeout(timer);
					this.cdp.off("Network.responseReceived", handler);
					resolve({ url, status, headers });
				}
			};

			this.cdp.on("Network.responseReceived", handler);
		});
	}

	async waitForRequest(
		urlOrPredicate: string | RegExp | ((url: string) => boolean),
		options: { timeout?: number } = {},
	): Promise<{ url: string; method: string }> {
		const { timeout = 30000 } = options;

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.cdp.off("Network.requestWillBeSent", handler);
				reject(new Error("Timeout waiting for request"));
			}, timeout);

			const handler = (params: {
				request: { url: string; method: string };
			}) => {
				const { url, method } = params.request;
				let matches = false;

				if (typeof urlOrPredicate === "string") {
					matches = url.includes(urlOrPredicate);
				} else if (urlOrPredicate instanceof RegExp) {
					matches = urlOrPredicate.test(url);
				} else {
					matches = urlOrPredicate(url);
				}

				if (matches) {
					clearTimeout(timer);
					this.cdp.off("Network.requestWillBeSent", handler);
					resolve({ url, method });
				}
			};

			this.cdp.on("Network.requestWillBeSent", handler);
		});
	}

	async reload(options: NavigateOptions = {}): Promise<void> {
		const { timeout = 30000, waitUntil = "load" } = options;

		const eventName =
			waitUntil === "domcontentloaded"
				? "Page.domContentEventFired"
				: "Page.loadEventFired";

		let timer: Timer;

		const loadPromise = new Promise<void>((resolve) => {
			const handler = () => {
				this.cdp.off(eventName, handler);
				resolve();
			};
			this.cdp.on(eventName, handler);
		});

		await this.cdp.send("Page.reload");

		const timeoutPromise = new Promise<never>((_, reject) => {
			timer = setTimeout(
				() => reject(new Error(`Reload timeout after ${timeout}ms`)),
				timeout,
			);
		});

		try {
			await Promise.race([loadPromise, timeoutPromise]);
		} finally {
			clearTimeout(timer!);
		}
	}

	async goBack(options: NavigateOptions = {}): Promise<void> {
		const history = await this.cdp.send<{
			currentIndex: number;
			entries: { id: number }[];
		}>("Page.getNavigationHistory");

		if (history.currentIndex > 0) {
			const entryId = history.entries[history.currentIndex - 1]!.id;
			await this.cdp.send("Page.navigateToHistoryEntry", { entryId });
			await this.waitForNavigation(options);
		}
	}

	async goForward(options: NavigateOptions = {}): Promise<void> {
		const history = await this.cdp.send<{
			currentIndex: number;
			entries: { id: number }[];
		}>("Page.getNavigationHistory");

		if (history.currentIndex < history.entries.length - 1) {
			const entryId = history.entries[history.currentIndex + 1]!.id;
			await this.cdp.send("Page.navigateToHistoryEntry", { entryId });
			await this.waitForNavigation(options);
		}
	}

	async setCookie(
		...cookies: Array<{
			name: string;
			value: string;
			url?: string;
			domain?: string;
			path?: string;
			secure?: boolean;
			httpOnly?: boolean;
			sameSite?: "Strict" | "Lax" | "None";
			expires?: number;
		}>
	): Promise<void> {
		await this.cdp.send("Network.setCookies", { cookies });
	}

	async cookies(urls?: string[]): Promise<
		Array<{
			name: string;
			value: string;
			domain: string;
			path: string;
			expires: number;
			httpOnly: boolean;
			secure: boolean;
			sameSite: string;
		}>
	> {
		const result = await this.cdp.send<{
			cookies: Array<{
				name: string;
				value: string;
				domain: string;
				path: string;
				expires: number;
				httpOnly: boolean;
				secure: boolean;
				sameSite: string;
			}>;
		}>("Network.getCookies", urls ? { urls } : {});
		return result.cookies;
	}

	async deleteCookie(name: string, url?: string): Promise<void> {
		await this.cdp.send("Network.deleteCookies", { name, url });
	}

	async setGeolocation(coords: {
		latitude: number;
		longitude: number;
		accuracy?: number;
	}): Promise<void> {
		await this.cdp.send("Browser.grantPermissions", {
			permissions: ["geolocation"],
		});
		await this.cdp.send("Emulation.setGeolocationOverride", {
			latitude: coords.latitude,
			longitude: coords.longitude,
			accuracy: coords.accuracy ?? 1,
		});
	}

	async getByText(
		text: string,
		options: { exact?: boolean } = {},
	): Promise<ElementHandle | null> {
		const { exact = false } = options;
		const result = await this.cdp.send<{
			result: { objectId?: string };
			exceptionDetails?: unknown;
		}>("Runtime.evaluate", {
			expression: `(() => {
				const walker = document.createTreeWalker(
					document.body,
					NodeFilter.SHOW_TEXT,
					null
				);
				while (walker.nextNode()) {
					const node = walker.currentNode;
					const matches = ${exact}
						? node.textContent?.trim() === ${JSON.stringify(text)}
						: node.textContent?.includes(${JSON.stringify(text)});
					if (matches && node.parentElement) {
						return node.parentElement;
					}
				}
				return null;
			})()`,
			returnByValue: false,
		});

		if (result.exceptionDetails || !result.result.objectId) return null;

		const { node } = await this.cdp.send<{ node: { nodeId: number } }>(
			"DOM.requestNode",
			{ objectId: result.result.objectId },
		);

		return new ElementHandle(this.cdp, node.nodeId);
	}

	async getAllByText(
		text: string,
		options: { exact?: boolean } = {},
	): Promise<ElementHandle[]> {
		const { exact = false } = options;
		const result = await this.cdp.send<{
			result: { value: unknown };
			exceptionDetails?: unknown;
		}>("Runtime.evaluate", {
			expression: `(() => {
				const elements = [];
				const walker = document.createTreeWalker(
					document.body,
					NodeFilter.SHOW_TEXT,
					null
				);
				while (walker.nextNode()) {
					const node = walker.currentNode;
					const matches = ${exact}
						? node.textContent?.trim() === ${JSON.stringify(text)}
						: node.textContent?.includes(${JSON.stringify(text)});
					if (matches && node.parentElement) {
						elements.push(node.parentElement);
					}
				}
				return elements;
			})()`,
			returnByValue: false,
		});

		if (result.exceptionDetails) return [];

		const { result: arrayProps } = await this.cdp.send<{
			result: Array<{ name: string; value?: { objectId: string } }>;
		}>("Runtime.getProperties", {
			objectId: (result.result as unknown as { objectId: string }).objectId,
			ownProperties: true,
		});

		const elements: ElementHandle[] = [];
		for (const prop of arrayProps) {
			if (prop.value?.objectId && !isNaN(Number(prop.name))) {
				const { node } = await this.cdp.send<{ node: { nodeId: number } }>(
					"DOM.requestNode",
					{ objectId: prop.value.objectId },
				);
				elements.push(new ElementHandle(this.cdp, node.nodeId));
			}
		}

		return elements;
	}

	async getByRole(
		role: string,
		options: { name?: string } = {},
	): Promise<ElementHandle | null> {
		const { name } = options;
		const nameFilter = name
			? `&& (el.getAttribute("aria-label")?.includes(${JSON.stringify(name)}) || el.textContent?.includes(${JSON.stringify(name)}))`
			: "";

		const result = await this.cdp.send<{
			result: { value: unknown };
			exceptionDetails?: unknown;
		}>("Runtime.evaluate", {
			expression: `(() => {
				const el = document.querySelector('[role="${role}"]');
				if (el ${nameFilter}) return el;

				// Implicit roles
				const implicit = {
					button: 'button, input[type="button"], input[type="submit"]',
					link: 'a[href]',
					textbox: 'input[type="text"], input:not([type]), textarea',
					checkbox: 'input[type="checkbox"]',
					radio: 'input[type="radio"]',
					heading: 'h1, h2, h3, h4, h5, h6',
				};

				if (implicit[${JSON.stringify(role)}]) {
					for (const el of document.querySelectorAll(implicit[${JSON.stringify(role)}])) {
						if (true ${nameFilter}) return el;
					}
				}
				return null;
			})()`,
			returnByValue: false,
		});

		if (result.exceptionDetails || !result.result.value) return null;

		const { node } = await this.cdp.send<{ node: { nodeId: number } }>(
			"DOM.requestNode",
			{ objectId: (result.result as unknown as { objectId: string }).objectId },
		);

		return new ElementHandle(this.cdp, node.nodeId);
	}

	async close(): Promise<void> {
		await this.cdp.close();
	}
}
