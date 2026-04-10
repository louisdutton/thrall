/**
 * Page - represents a browser tab backed by Bun.WebView
 */

import { ElementHandle, type EvalFn } from "./element";
import { Keyboard } from "./keyboard";
import { Mouse } from "./mouse";
import { Screencast, type ScreencastOptions } from "./screencast";

interface NavigateOptions {
	timeout?: number;
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
	readonly view: InstanceType<typeof Bun.WebView>;
	readonly keyboard: Keyboard;
	readonly mouse: Mouse;
	private _evalQueue: Promise<unknown> = Promise.resolve();

	constructor(view: InstanceType<typeof Bun.WebView>) {
		this.view = view;
		this.keyboard = new Keyboard(view, this._enqueue.bind(this));
		this.mouse = new Mouse(view, this._enqueue.bind(this));
	}

	/**
	 * Serialize all view.evaluate() calls to avoid "already pending" errors.
	 */
	private _eval<T>(expression: string): Promise<T> {
		return this._enqueue(expression);
	}

	/** Shared evaluation queue - also used by Keyboard, Mouse, Element */
	_enqueue<T>(expression: string): Promise<T> {
		const next = this._evalQueue.then(
			() => this.view.evaluate(expression) as Promise<T>,
			() => this.view.evaluate(expression) as Promise<T>,
		);
		this._evalQueue = next.then(
			() => {},
			() => {},
		);
		return next;
	}

	async goto(url: string, options: NavigateOptions = {}): Promise<void> {
		const { timeout = 30000 } = options;

		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(
				() => reject(new Error(`Navigation timeout after ${timeout}ms`)),
				timeout,
			);
		});

		await Promise.race([this.view.navigate(url), timeoutPromise]);

		// Wait for the page to finish loading and document to be ready
		const start = Date.now();
		while (Date.now() - start < timeout) {
			if (!this.view.loading) {
				const ready = await this._eval<string>("document.readyState");
				if (ready === "complete" || ready === "interactive") return;
			}
			await Bun.sleep(50);
		}
	}

	async content(): Promise<string> {
		return this._eval<string>("document.documentElement.outerHTML");
	}

	async title(): Promise<string> {
		return this._eval<string>("document.title");
	}

	async url(): Promise<string> {
		return this.view.url;
	}

	async $(selector: string): Promise<ElementHandle | null> {
		const exists = await this._eval<boolean>(
			`document.querySelector(${JSON.stringify(selector)}) !== null`,
		);
		if (!exists) return null;
		return new ElementHandle(this.view, selector, 0, this._enqueue.bind(this));
	}

	async $$(selector: string): Promise<ElementHandle[]> {
		const count = await this._eval<number>(
			`document.querySelectorAll(${JSON.stringify(selector)}).length`,
		);

		const elements: ElementHandle[] = [];
		for (let i = 0; i < count; i++) {
			elements.push(
				new ElementHandle(this.view, selector, i, this._enqueue.bind(this)),
			);
		}
		return elements;
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
				const isVis = await element.isVisible();
				if (!isVis) return element;
			} else if (element) {
				if (!visible) return element;
				const isVis = await element.isVisible();
				if (isVis) return element;
			}

			await Bun.sleep(100);
		}

		throw new Error(`Timeout waiting for selector: ${selector}`);
	}

	async click(selector: string): Promise<void> {
		await this.view.click(selector);
	}

	async type(selector: string, text: string): Promise<void> {
		await this.view.click(selector);
		await this.view.type(text);
	}

	async fill(selector: string, value: string): Promise<void> {
		await this.view.click(selector);
		await this._eval<void>(
			`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ''; })()`,
		);
		await this._eval<void>(
			`(() => {
				const el = document.querySelector(${JSON.stringify(selector)});
				el.value = ${JSON.stringify(value)};
				el.dispatchEvent(new Event('input', { bubbles: true }));
				el.dispatchEvent(new Event('change', { bubbles: true }));
			})()`,
		);
	}

	async humanType(
		selector: string,
		text: string,
		options: { delay?: number } = {},
	): Promise<void> {
		const { delay = 40 } = options;
		await this.view.click(selector);

		await this._eval<void>(
			`(async () => {
				const el = document.querySelector(${JSON.stringify(selector)});
				el.value = '';
				const text = ${JSON.stringify(text)};
				const delay = ${delay};
				for (let i = 0; i < text.length; i++) {
					el.value = text.slice(0, i + 1);
					el.dispatchEvent(new Event('input', { bubbles: true }));
					await new Promise(r => setTimeout(r, delay));
				}
				el.dispatchEvent(new Event('change', { bubbles: true }));
			})()`,
		);
	}

	async evaluate<T>(
		fn: string | ((...args: any[]) => T),
		...args: any[]
	): Promise<T> {
		const expression =
			typeof fn === "string"
				? fn
				: `(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(",")})`;

		return this._eval<T>(expression);
	}

	async screenshot(options: ScreenshotOptions = {}): Promise<Buffer> {
		const { type = "png", quality } = options;

		if (options.fullPage) {
			// Scroll to capture full page height by expanding the viewport temporarily
			const dimensions = await this._eval<{ width: number; height: number }>(
				`({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })`,
			);
			await this.view.resize(dimensions.width, dimensions.height);
		}

		const blob = await this.view.screenshot({
			format: type,
			quality: type === "jpeg" ? quality : undefined,
		});

		if (options.fullPage) {
			// Restore original viewport - no stored dimensions, use reasonable defaults
			await this.view.resize(1280, 720);
		}

		const buffer = Buffer.from(await blob.arrayBuffer());

		if (options.path) {
			await Bun.write(options.path, buffer);
		}

		return buffer;
	}

	/**
	 * Generate a PDF of the page. Requires Chrome backend
	 * (launch with `executablePath` or set `THRALL_BROWSER`).
	 */
	async pdf(options: { path?: string } = {}): Promise<Buffer> {
		const result = (await this.view.cdp("Page.printToPDF", {
			printBackground: true,
		})) as { data: string };

		const buffer = Buffer.from(result.data, "base64");

		if (options.path) {
			await Bun.write(options.path, buffer);
		}

		return buffer;
	}

	async setViewport(width: number, height: number): Promise<void> {
		await this.view.resize(width, height);
	}

	async waitForNavigation(options: NavigateOptions = {}): Promise<void> {
		const { timeout = 30000 } = options;
		const start = Date.now();

		// Poll view.loading until the page finishes loading
		while (Date.now() - start < timeout) {
			if (!this.view.loading) return;
			await Bun.sleep(50);
		}

		throw new Error(`Navigation timeout after ${timeout}ms`);
	}

	async waitForFunction<T>(
		fn: string | (() => T),
		options: { timeout?: number; polling?: number } = {},
	): Promise<T> {
		const { timeout = 30000, polling = 100 } = options;
		const expression = typeof fn === "string" ? fn : `(${fn.toString()})()`;
		const start = Date.now();

		while (Date.now() - start < timeout) {
			const result = await this._eval<T>(expression);
			if (result) return result as T;
			await Bun.sleep(polling);
		}

		throw new Error(`Timeout waiting for function`);
	}

	async waitForResponse(
		urlOrPredicate: string | RegExp | ((url: string) => boolean),
		options: { timeout?: number } = {},
	): Promise<{ url: string; status: number; headers: Record<string, string> }> {
		const { timeout = 30000 } = options;

		// Install a fetch/XHR observer in the page
		const id = `__thrall_resp_${Date.now()}`;
		const predicateJs =
			typeof urlOrPredicate === "string"
				? `url.includes(${JSON.stringify(urlOrPredicate)})`
				: urlOrPredicate instanceof RegExp
					? `${urlOrPredicate}.test(url)`
					: `(${urlOrPredicate.toString()})(url)`;

		await this._eval<void>(
			`(() => {
				window.${id} = null;
				const origFetch = window.fetch;
				window.fetch = async function(...args) {
					const resp = await origFetch.apply(this, args);
					const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
					if (${predicateJs}) {
						const headers = {};
						resp.headers.forEach((v, k) => { headers[k] = v; });
						window.${id} = { url, status: resp.status, headers };
					}
					return resp;
				};
			})()`,
		);

		const start = Date.now();
		while (Date.now() - start < timeout) {
			const result = await this._eval<{
				url: string;
				status: number;
				headers: Record<string, string>;
			} | null>(`window.${id}`);
			if (result) {
				// Clean up
				await this._eval<void>(`delete window.${id}`);
				return result;
			}
			await Bun.sleep(50);
		}

		await this._eval<void>(`delete window.${id}`);
		throw new Error("Timeout waiting for response");
	}

	async waitForRequest(
		urlOrPredicate: string | RegExp | ((url: string) => boolean),
		options: { timeout?: number } = {},
	): Promise<{ url: string; method: string }> {
		const { timeout = 30000 } = options;

		const id = `__thrall_req_${Date.now()}`;
		const predicateJs =
			typeof urlOrPredicate === "string"
				? `url.includes(${JSON.stringify(urlOrPredicate)})`
				: urlOrPredicate instanceof RegExp
					? `${urlOrPredicate}.test(url)`
					: `(${urlOrPredicate.toString()})(url)`;

		await this._eval<void>(
			`(() => {
				window.${id} = null;
				const origFetch = window.fetch;
				window.fetch = async function(...args) {
					const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
					const method = args[1]?.method || 'GET';
					if (${predicateJs}) {
						window.${id} = { url, method };
					}
					return origFetch.apply(this, args);
				};
			})()`,
		);

		const start = Date.now();
		while (Date.now() - start < timeout) {
			const result = await this._eval<{ url: string; method: string } | null>(
				`window.${id}`,
			);
			if (result) {
				await this._eval<void>(`delete window.${id}`);
				return result;
			}
			await Bun.sleep(50);
		}

		await this._eval<void>(`delete window.${id}`);
		throw new Error("Timeout waiting for request");
	}

	async reload(options: NavigateOptions = {}): Promise<void> {
		await this.view.reload();
		await this.waitForNavigation(options);
	}

	async goBack(options: NavigateOptions = {}): Promise<void> {
		await this.view.goBack();
		await this.waitForNavigation(options);
	}

	async goForward(options: NavigateOptions = {}): Promise<void> {
		await this.view.goForward();
		await this.waitForNavigation(options);
	}

	async setCookie(
		...cookies: Array<{
			name: string;
			value: string;
			domain?: string;
			path?: string;
			secure?: boolean;
			sameSite?: "Strict" | "Lax" | "None";
			expires?: number;
		}>
	): Promise<void> {
		for (const cookie of cookies) {
			let cookieStr = `${encodeURIComponent(cookie.name)}=${encodeURIComponent(cookie.value)}`;
			if (cookie.path) cookieStr += `; path=${cookie.path}`;
			if (cookie.domain) cookieStr += `; domain=${cookie.domain}`;
			if (cookie.secure) cookieStr += "; secure";
			if (cookie.sameSite) cookieStr += `; samesite=${cookie.sameSite}`;
			if (cookie.expires)
				cookieStr += `; expires=${new Date(cookie.expires * 1000).toUTCString()}`;
			await this._eval<void>(`document.cookie = ${JSON.stringify(cookieStr)}`);
		}
	}

	async cookies(): Promise<
		Array<{
			name: string;
			value: string;
		}>
	> {
		return this._eval<Array<{ name: string; value: string }>>(
			`document.cookie.split('; ').filter(Boolean).map(c => {
				const [name, ...rest] = c.split('=');
				return { name: decodeURIComponent(name), value: decodeURIComponent(rest.join('=')) };
			})`,
		);
	}

	async deleteCookie(name: string): Promise<void> {
		await this._eval<void>(
			`document.cookie = ${JSON.stringify(encodeURIComponent(name))} + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'`,
		);
	}

	async setGeolocation(coords: {
		latitude: number;
		longitude: number;
		accuracy?: number;
	}): Promise<void> {
		const { latitude, longitude, accuracy = 1 } = coords;
		await this._eval<void>(
			`navigator.geolocation.getCurrentPosition = (success) => {
				success({
					coords: {
						latitude: ${latitude}, longitude: ${longitude}, accuracy: ${accuracy},
						altitude: null, altitudeAccuracy: null, heading: null, speed: null,
					},
					timestamp: Date.now(),
				});
			};
			navigator.geolocation.watchPosition = (success) => {
				success({
					coords: {
						latitude: ${latitude}, longitude: ${longitude}, accuracy: ${accuracy},
						altitude: null, altitudeAccuracy: null, heading: null, speed: null,
					},
					timestamp: Date.now(),
				});
				return 0;
			}`,
		);
	}

	/**
	 * Find an element by its text content. Auto-waits until the element is found
	 * or the timeout is reached.
	 */
	async getByText(
		text: string,
		options: { exact?: boolean; timeout?: number } = {},
	): Promise<ElementHandle> {
		const { exact = false, timeout = 30000 } = options;
		const start = Date.now();

		while (Date.now() - start < timeout) {
			const found = await this._eval<boolean>(
				`(() => {
					const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
					while (walker.nextNode()) {
						const node = walker.currentNode;
						const matches = ${exact}
							? node.textContent?.trim() === ${JSON.stringify(text)}
							: node.textContent?.includes(${JSON.stringify(text)});
						if (matches && node.parentElement) return true;
					}
					return false;
				})()`,
			);

			if (found) {
				// Build a selector-like reference for the element
				// We use a data attribute approach: tag the element so we can find it
				const tagged = await this._eval<string | null>(
					`(() => {
						const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
						while (walker.nextNode()) {
							const node = walker.currentNode;
							const matches = ${exact}
								? node.textContent?.trim() === ${JSON.stringify(text)}
								: node.textContent?.includes(${JSON.stringify(text)});
							if (matches && node.parentElement) {
								const id = '__thrall_' + Math.random().toString(36).slice(2);
								node.parentElement.setAttribute('data-thrall-id', id);
								return id;
							}
						}
						return null;
					})()`,
				);

				if (tagged) {
					return new ElementHandle(
						this.view,
						`[data-thrall-id="${tagged}"]`,
						0,
						this._enqueue.bind(this),
					);
				}
			}

			await Bun.sleep(100);
		}

		throw new Error(`Unable to find element with text: ${text}`);
	}

	/**
	 * Find all elements matching the given text content.
	 */
	async getAllByText(
		text: string,
		options: { exact?: boolean } = {},
	): Promise<ElementHandle[]> {
		const { exact = false } = options;

		const ids = await this._eval<string[]>(
			`(() => {
				const ids = [];
				const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
				while (walker.nextNode()) {
					const node = walker.currentNode;
					const matches = ${exact}
						? node.textContent?.trim() === ${JSON.stringify(text)}
						: node.textContent?.includes(${JSON.stringify(text)});
					if (matches && node.parentElement) {
						const id = '__thrall_' + Math.random().toString(36).slice(2);
						node.parentElement.setAttribute('data-thrall-id', id);
						ids.push(id);
					}
				}
				return ids;
			})()`,
		);

		if (!ids || ids.length === 0) return [];
		return ids.map(
			(id) =>
				new ElementHandle(
					this.view,
					`[data-thrall-id="${id}"]`,
					0,
					this._enqueue.bind(this),
				),
		);
	}

	/**
	 * Find an element by its ARIA role. Auto-waits until the element is found.
	 */
	async getByRole(
		role: string,
		options: { name?: string; timeout?: number } = {},
	): Promise<ElementHandle> {
		const { name, timeout = 30000 } = options;
		const start = Date.now();

		const implicit: Record<string, string> = {
			button: 'button, input[type="button"], input[type="submit"]',
			link: "a[href]",
			textbox: 'input[type="text"], input:not([type]), textarea',
			checkbox: 'input[type="checkbox"]',
			radio: 'input[type="radio"]',
			heading: "h1, h2, h3, h4, h5, h6",
		};

		const selectors = [`[role="${role}"]`];
		if (implicit[role]) {
			selectors.push(implicit[role]);
		}
		const combinedSelector = selectors.join(", ");

		while (Date.now() - start < timeout) {
			if (!name) {
				const element = await this.$(combinedSelector);
				if (element) return element;
			} else {
				const candidates = await this.$$(combinedSelector);
				for (const element of candidates) {
					const ariaLabel = await element.getAttribute("aria-label");
					if (ariaLabel?.includes(name)) return element;
					const textContent = await element.textContent();
					if (textContent?.includes(name)) return element;
				}
			}

			await Bun.sleep(100);
		}

		const errorMsg = name
			? `Unable to find element with role "${role}" and name "${name}"`
			: `Unable to find element with role "${role}"`;
		throw new Error(errorMsg);
	}

	/**
	 * Smooth scroll within an element by dispatching scroll events.
	 */
	async smoothScroll(
		selector: string,
		deltaY: number,
		options: { duration?: number } = {},
	): Promise<void> {
		const { duration = 1000 } = options;
		const interval = 16;
		const steps = Math.max(1, Math.round(duration / interval));
		const stepDelta = deltaY / steps;

		for (let i = 0; i < steps; i++) {
			await this._eval<void>(
				`(() => {
					const el = document.querySelector(${JSON.stringify(selector)});
					if (el) el.scrollTop += ${stepDelta};
				})()`,
			);
			await Bun.sleep(interval);
		}
	}

	/**
	 * Start a screencast recording session.
	 */
	async startScreencast(options: ScreencastOptions = {}): Promise<Screencast> {
		const screencast = new Screencast(this.view, options);
		await screencast.start();
		return screencast;
	}

	/**
	 * Set files on a file input element. Requires Chrome backend
	 * (launch with `executablePath` or set `THRALL_BROWSER`).
	 */
	async setInputFiles(selector: string, files: string[]): Promise<void> {
		const nodeId = (await this.view.cdp("DOM.getDocument", {})) as any;
		const root = nodeId.root.nodeId;
		const queryResult = (await this.view.cdp("DOM.querySelector", {
			nodeId: root,
			selector,
		})) as { nodeId: number };
		if (!queryResult.nodeId)
			throw new Error(`File input not found: ${selector}`);
		await this.view.cdp("DOM.setFileInputFiles", {
			files,
			nodeId: queryResult.nodeId,
		});
	}

	async close(): Promise<void> {
		(this.view as any)[Symbol.dispose]?.();
	}
}
