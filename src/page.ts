/**
 * Page - single-page browser automation backed by Bun.WebView
 */

import { ElementHandle } from "./element";
import { Screencast, type ScreencastOptions } from "./screencast";

export interface PageOptions {
	/** Path to Chrome/Chromium executable (uses native WebView if omitted) */
	executablePath?: string;
	/** Extra browser arguments (Chrome backend only) */
	args?: string[];
	/** Viewport width (default: 1280) */
	width?: number;
	/** Viewport height (default: 720) */
	height?: number;
	/** Default timeout in ms for all waiting operations (default: 30000) */
	timeout?: number;
}

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

type MouseButton = "left" | "right" | "middle";

export class Page {
	readonly view: InstanceType<typeof Bun.WebView>;
	private _evalQueue: Promise<unknown> = Promise.resolve();
	private _width: number;
	private _height: number;
	private _timeout: number;

	// Mouse state
	private _mouseX = 0;
	private _mouseY = 0;
	private _mouseButton: MouseButton = "left";

	// Keyboard modifier state
	private _modifiers = 0;

	constructor(view: InstanceType<typeof Bun.WebView>, width: number, height: number, timeout: number) {
		this.view = view;
		this._width = width;
		this._height = height;
		this._timeout = timeout;
	}

	/** Default timeout for waiting operations. */
	get defaultTimeout(): number {
		return this._timeout;
	}
	set defaultTimeout(ms: number) {
		this._timeout = ms;
	}

	// ---------------------------------------------------------------------------
	// Evaluate serialization
	// ---------------------------------------------------------------------------

	/** Serialize all view.evaluate() calls to avoid "already pending" errors. */
	_eval<T>(expression: string): Promise<T> {
		const next = this._evalQueue.then(
			() => this.view.evaluate(expression) as Promise<T>,
			() => this.view.evaluate(expression) as Promise<T>,
		);
		this._evalQueue = next.then(() => {}, () => {});
		return next;
	}

	// ---------------------------------------------------------------------------
	// Navigation
	// ---------------------------------------------------------------------------

	async goto(url: string, options: NavigateOptions = {}): Promise<void> {
		const { timeout = this._timeout } = options;

		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(() => reject(new Error(`Navigation timeout after ${timeout}ms`)), timeout);
		});

		await Promise.race([this.view.navigate(url), timeoutPromise]);

		const start = Date.now();
		while (Date.now() - start < timeout) {
			if (!this.view.loading) {
				const ready = await this._eval<string>("document.readyState");
				if (ready === "complete" || ready === "interactive") return;
			}
			await Bun.sleep(50);
		}
	}

	async reload(options: NavigateOptions = {}): Promise<void> {
		await this.view.reload();
		await this.waitForNavigation(options);
	}

	async goBack(options: NavigateOptions = {}): Promise<void> {
		try {
			await this.view.goBack();
		} catch {
			// WebView may throw if no history entry; use JS fallback
			await this._eval<void>("window.history.back()");
		}
		await Bun.sleep(100);
		await this.waitForNavigation(options).catch(() => {});
	}

	async goForward(options: NavigateOptions = {}): Promise<void> {
		try {
			await this.view.goForward();
		} catch {
			await this._eval<void>("window.history.forward()");
		}
		await Bun.sleep(100);
		await this.waitForNavigation(options).catch(() => {});
	}

	async waitForNavigation(options: NavigateOptions = {}): Promise<void> {
		const { timeout = this._timeout } = options;
		const start = Date.now();
		while (Date.now() - start < timeout) {
			if (!this.view.loading) return;
			await Bun.sleep(50);
		}
		throw new Error(`Navigation timeout after ${timeout}ms`);
	}

	/**
	 * Wait for the page URL to match a string, regex, or predicate.
	 */
	async waitForURL(
		urlOrPredicate: string | RegExp | ((url: string) => boolean),
		options: { timeout?: number } = {},
	): Promise<void> {
		const { timeout = this._timeout } = options;
		const start = Date.now();

		const matches = (current: string): boolean => {
			if (typeof urlOrPredicate === "string") return current === urlOrPredicate;
			if (urlOrPredicate instanceof RegExp) return urlOrPredicate.test(current);
			return urlOrPredicate(current);
		};

		while (Date.now() - start < timeout) {
			if (matches(this.view.url)) return;
			await Bun.sleep(50);
		}

		throw new Error(`Timeout waiting for URL matching ${urlOrPredicate} (current: ${this.view.url})`);
	}

	// ---------------------------------------------------------------------------
	// Page info
	// ---------------------------------------------------------------------------

	async content(): Promise<string> {
		return this._eval<string>("document.documentElement.outerHTML");
	}

	async title(): Promise<string> {
		return this._eval<string>("document.title");
	}

	async url(): Promise<string> {
		return this.view.url;
	}

	// ---------------------------------------------------------------------------
	// Element queries
	// ---------------------------------------------------------------------------

	/** Wait for a selector to exist in the DOM, returning true. Throws on timeout. */
	private async _waitFor(selector: string, timeout?: number): Promise<void> {
		const t = timeout ?? this._timeout;
		const start = Date.now();
		while (Date.now() - start < t) {
			const exists = await this._eval<boolean>(
				`document.querySelector(${JSON.stringify(selector)}) !== null`,
			);
			if (exists) return;
			await Bun.sleep(50);
		}
		throw new Error(`Timeout waiting for ${selector}`);
	}

	async $(selector: string): Promise<ElementHandle | null> {
		const exists = await this._eval<boolean>(
			`document.querySelector(${JSON.stringify(selector)}) !== null`,
		);
		if (!exists) return null;
		return new ElementHandle(this, selector, 0);
	}

	async $$(selector: string): Promise<ElementHandle[]> {
		const count = await this._eval<number>(
			`document.querySelectorAll(${JSON.stringify(selector)}).length`,
		);
		const elements: ElementHandle[] = [];
		for (let i = 0; i < count; i++) {
			elements.push(new ElementHandle(this, selector, i));
		}
		return elements;
	}

	async waitForSelector(
		selector: string,
		options: WaitForSelectorOptions = {},
	): Promise<ElementHandle> {
		const { timeout = this._timeout, visible = false, hidden = false } = options;
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

	/**
	 * Find an element by its text content. Auto-waits until found or timeout.
	 */
	async getByText(
		text: string,
		options: { exact?: boolean; timeout?: number } = {},
	): Promise<ElementHandle> {
		const { exact = false, timeout = this._timeout } = options;
		const start = Date.now();

		while (Date.now() - start < timeout) {
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
				return new ElementHandle(this, `[data-thrall-id="${tagged}"]`, 0);
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
		return ids.map((id) => new ElementHandle(this, `[data-thrall-id="${id}"]`, 0));
	}

	/**
	 * Find an element by its ARIA role. Auto-waits until found.
	 */
	async getByRole(
		role: string,
		options: { name?: string; timeout?: number } = {},
	): Promise<ElementHandle> {
		const { name, timeout = this._timeout } = options;
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
		if (implicit[role]) selectors.push(implicit[role]);
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
	 * Find an input by its associated label text. Auto-waits.
	 */
	async getByLabel(
		text: string,
		options: { exact?: boolean; timeout?: number } = {},
	): Promise<ElementHandle> {
		const { exact = false, timeout = this._timeout } = options;
		const start = Date.now();

		while (Date.now() - start < timeout) {
			const tagged = await this._eval<string | null>(
				`(() => {
					const labels = document.querySelectorAll('label');
					for (const label of labels) {
						const matches = ${exact}
							? label.textContent?.trim() === ${JSON.stringify(text)}
							: label.textContent?.includes(${JSON.stringify(text)});
						if (!matches) continue;
						let input = label.control;
						if (!input && label.htmlFor) {
							input = document.getElementById(label.htmlFor);
						}
						if (!input) {
							input = label.querySelector('input, textarea, select');
						}
						if (input) {
							const id = '__thrall_' + Math.random().toString(36).slice(2);
							input.setAttribute('data-thrall-id', id);
							return id;
						}
					}
					// Also check aria-label on inputs directly
					const inputs = document.querySelectorAll('input, textarea, select');
					for (const input of inputs) {
						const ariaLabel = input.getAttribute('aria-label') || '';
						const matches = ${exact}
							? ariaLabel.trim() === ${JSON.stringify(text)}
							: ariaLabel.includes(${JSON.stringify(text)});
						if (matches) {
							const id = '__thrall_' + Math.random().toString(36).slice(2);
							input.setAttribute('data-thrall-id', id);
							return id;
						}
					}
					return null;
				})()`,
			);

			if (tagged) {
				return new ElementHandle(this, `[data-thrall-id="${tagged}"]`, 0);
			}

			await Bun.sleep(100);
		}

		throw new Error(`Unable to find input with label: ${text}`);
	}

	/**
	 * Find an element by its placeholder text. Auto-waits.
	 */
	async getByPlaceholder(
		text: string,
		options: { exact?: boolean; timeout?: number } = {},
	): Promise<ElementHandle> {
		const { exact = false, timeout = this._timeout } = options;
		const selector = exact
			? `[placeholder=${JSON.stringify(text)}]`
			: `[placeholder]`;

		const start = Date.now();

		while (Date.now() - start < timeout) {
			if (exact) {
				const el = await this.$(selector);
				if (el) return el;
			} else {
				const tagged = await this._eval<string | null>(
					`(() => {
						const els = document.querySelectorAll('[placeholder]');
						for (const el of els) {
							if (el.getAttribute('placeholder')?.includes(${JSON.stringify(text)})) {
								const id = '__thrall_' + Math.random().toString(36).slice(2);
								el.setAttribute('data-thrall-id', id);
								return id;
							}
						}
						return null;
					})()`,
				);

				if (tagged) {
					return new ElementHandle(this, `[data-thrall-id="${tagged}"]`, 0);
				}
			}

			await Bun.sleep(100);
		}

		throw new Error(`Unable to find element with placeholder: ${text}`);
	}

	/**
	 * Find an element by its test ID (`data-testid` attribute). Auto-waits.
	 */
	async getByTestId(
		testId: string,
		options: { timeout?: number } = {},
	): Promise<ElementHandle> {
		const { timeout = this._timeout } = options;
		const selector = `[data-testid=${JSON.stringify(testId)}]`;
		return this.waitForSelector(selector, { timeout });
	}

	// ---------------------------------------------------------------------------
	// Interaction
	// ---------------------------------------------------------------------------

	async click(selector: string): Promise<void> {
		await this._waitFor(selector);
		await this.view.click(selector);
	}

	async type(selector: string, text: string): Promise<void> {
		await this._waitFor(selector);
		await this.view.click(selector);
		await this.view.type(text);
	}

	async fill(selector: string, value: string): Promise<void> {
		await this._waitFor(selector);
		await this.view.click(selector);
		await this._eval<void>(
			`(() => {
				const el = document.querySelector(${JSON.stringify(selector)});
				el.value = ${JSON.stringify(value)};
				el.dispatchEvent(new Event('input', { bubbles: true }));
				el.dispatchEvent(new Event('change', { bubbles: true }));
			})()`,
		);
	}

	/**
	 * Type text character by character with realistic delays and per-char input events.
	 */
	async humanType(
		selector: string,
		text: string,
		options: { delay?: number } = {},
	): Promise<void> {
		const { delay = 40 } = options;
		await this._waitFor(selector);
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

	async evaluate<T>(fn: string | ((...args: any[]) => T), ...args: any[]): Promise<T> {
		const expression =
			typeof fn === "string"
				? fn
				: `(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(",")})`;
		return this._eval<T>(expression);
	}

	async waitForFunction<T>(
		fn: string | (() => T),
		options: { timeout?: number; polling?: number } = {},
	): Promise<T> {
		const { timeout = this._timeout, polling = 100 } = options;
		const expression = typeof fn === "string" ? fn : `(${fn.toString()})()`;
		const start = Date.now();

		while (Date.now() - start < timeout) {
			const result = await this._eval<T>(expression);
			if (result) return result as T;
			await Bun.sleep(polling);
		}

		throw new Error("Timeout waiting for function");
	}

	// ---------------------------------------------------------------------------
	// Screenshot & viewport
	// ---------------------------------------------------------------------------

	async screenshot(options: ScreenshotOptions = {}): Promise<Buffer> {
		const { type = "png", quality } = options;

		if (options.fullPage) {
			const dimensions = await this._eval<{ width: number; height: number }>(
				"({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })",
			);
			await this.view.resize(dimensions.width, dimensions.height);
		}

		const blob = await this.view.screenshot({
			format: type,
			quality: type === "jpeg" ? quality : undefined,
		});

		if (options.fullPage) {
			await this.view.resize(this._width, this._height);
		}

		const buffer = Buffer.from(await blob.arrayBuffer());

		if (options.path) {
			await Bun.write(options.path, buffer);
		}

		return buffer;
	}

	async setViewport(width: number, height: number): Promise<void> {
		this._width = width;
		this._height = height;
		await this.view.resize(width, height);
	}

	// ---------------------------------------------------------------------------
	// Keyboard
	// ---------------------------------------------------------------------------

	async press(key: string): Promise<void> {
		const def = KEY_DEFINITIONS[key];
		await this.view.press(def?.key ?? key);
	}

	async keyDown(key: string): Promise<void> {
		if (key === "Shift") this._modifiers |= 8;
		if (key === "Control") this._modifiers |= 4;
		if (key === "Alt") this._modifiers |= 2;
		if (key === "Meta") this._modifiers |= 1;

		const def = KEY_DEFINITIONS[key];
		const keyVal = def?.key ?? key;
		const code = def?.code ?? `Key${key.toUpperCase()}`;
		const keyCode = def?.keyCode ?? key.charCodeAt(0);

		await this._eval(
			`document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', {
				key: ${JSON.stringify(keyVal)},
				code: ${JSON.stringify(code)},
				keyCode: ${keyCode},
				bubbles: true, cancelable: true,
				shiftKey: ${!!(this._modifiers & 8)},
				ctrlKey: ${!!(this._modifiers & 4)},
				altKey: ${!!(this._modifiers & 2)},
				metaKey: ${!!(this._modifiers & 1)},
			}))`,
		);
	}

	async keyUp(key: string): Promise<void> {
		if (key === "Shift") this._modifiers &= ~8;
		if (key === "Control") this._modifiers &= ~4;
		if (key === "Alt") this._modifiers &= ~2;
		if (key === "Meta") this._modifiers &= ~1;

		const def = KEY_DEFINITIONS[key];
		const keyVal = def?.key ?? key;
		const code = def?.code ?? `Key${key.toUpperCase()}`;
		const keyCode = def?.keyCode ?? key.charCodeAt(0);

		await this._eval(
			`document.activeElement?.dispatchEvent(new KeyboardEvent('keyup', {
				key: ${JSON.stringify(keyVal)},
				code: ${JSON.stringify(code)},
				keyCode: ${keyCode},
				bubbles: true, cancelable: true,
				shiftKey: ${!!(this._modifiers & 8)},
				ctrlKey: ${!!(this._modifiers & 4)},
				altKey: ${!!(this._modifiers & 2)},
				metaKey: ${!!(this._modifiers & 1)},
			}))`,
		);
	}

	async typeText(text: string, options: { delay?: number } = {}): Promise<void> {
		const { delay = 0 } = options;
		if (delay === 0) {
			await this.view.type(text);
			return;
		}
		for (const char of text) {
			await this.view.press(char);
			if (delay > 0) await Bun.sleep(delay);
		}
	}

	// ---------------------------------------------------------------------------
	// Mouse
	// ---------------------------------------------------------------------------

	async mouseMove(x: number, y: number, options: { steps?: number } = {}): Promise<void> {
		const { steps = 1 } = options;
		const fromX = this._mouseX;
		const fromY = this._mouseY;

		for (let i = 1; i <= steps; i++) {
			const currentX = fromX + (x - fromX) * (i / steps);
			const currentY = fromY + (y - fromY) * (i / steps);

			await this._eval(
				`(() => {
					const el = document.elementFromPoint(${currentX}, ${currentY}) || document.body;
					el.dispatchEvent(new MouseEvent('mousemove', {
						clientX: ${currentX}, clientY: ${currentY},
						bubbles: true, cancelable: true,
					}));
				})()`,
			);
		}

		this._mouseX = x;
		this._mouseY = y;
	}

	async mouseDown(options: { button?: MouseButton; clickCount?: number } = {}): Promise<void> {
		const { button = "left", clickCount = 1 } = options;
		this._mouseButton = button;
		const buttonNum = button === "left" ? 0 : button === "right" ? 2 : 1;

		await this._eval(
			`(() => {
				const el = document.elementFromPoint(${this._mouseX}, ${this._mouseY}) || document.body;
				el.dispatchEvent(new MouseEvent('mousedown', {
					clientX: ${this._mouseX}, clientY: ${this._mouseY},
					button: ${buttonNum}, detail: ${clickCount},
					bubbles: true, cancelable: true,
				}));
			})()`,
		);
	}

	async mouseUp(options: { button?: MouseButton; clickCount?: number } = {}): Promise<void> {
		const { button = this._mouseButton, clickCount = 1 } = options;
		const buttonNum = button === "left" ? 0 : button === "right" ? 2 : 1;

		await this._eval(
			`(() => {
				const el = document.elementFromPoint(${this._mouseX}, ${this._mouseY}) || document.body;
				el.dispatchEvent(new MouseEvent('mouseup', {
					clientX: ${this._mouseX}, clientY: ${this._mouseY},
					button: ${buttonNum}, detail: ${clickCount},
					bubbles: true, cancelable: true,
				}));
			})()`,
		);
	}

	async mouseClick(
		x: number,
		y: number,
		options: { button?: MouseButton; clickCount?: number; delay?: number } = {},
	): Promise<void> {
		const { delay = 0 } = options;
		await this.mouseMove(x, y);
		await this.mouseDown(options);
		if (delay > 0) await Bun.sleep(delay);
		await this.mouseUp(options);
	}

	async dblclick(x: number, y: number, options: { button?: MouseButton; delay?: number } = {}): Promise<void> {
		await this.mouseClick(x, y, { ...options, clickCount: 2 });
	}

	async wheel(options: { deltaX?: number; deltaY?: number } = {}): Promise<void> {
		const { deltaX = 0, deltaY = 0 } = options;

		await this._eval(
			`(() => {
				const el = document.elementFromPoint(${this._mouseX}, ${this._mouseY}) || document.body;
				el.dispatchEvent(new WheelEvent('wheel', {
					clientX: ${this._mouseX}, clientY: ${this._mouseY},
					deltaX: ${deltaX}, deltaY: ${deltaY},
					bubbles: true, cancelable: true,
				}));
			})()`,
		);
	}

	async scroll(selector: string, deltaY: number): Promise<void> {
		await this._eval<void>(
			`(() => {
				const el = document.querySelector(${JSON.stringify(selector)});
				if (el) el.scrollTop += ${deltaY};
			})()`,
		);
	}

	/**
	 * Smooth scroll within an element over a duration.
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
	 * Smooth wheel scroll at current mouse position over a duration.
	 */
	async smoothWheel(
		deltaY: number,
		options: { deltaX?: number; duration?: number } = {},
	): Promise<void> {
		const { deltaX = 0, duration = 1000 } = options;
		const interval = 16;
		const steps = Math.max(1, Math.round(duration / interval));
		const stepDeltaX = deltaX / steps;
		const stepDeltaY = deltaY / steps;

		for (let i = 0; i < steps; i++) {
			await this.wheel({ deltaX: stepDeltaX, deltaY: stepDeltaY });
			await Bun.sleep(interval);
		}
	}

	// ---------------------------------------------------------------------------
	// Cookies
	// ---------------------------------------------------------------------------

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
			if (cookie.expires) cookieStr += `; expires=${new Date(cookie.expires * 1000).toUTCString()}`;
			await this._eval<void>(`document.cookie = ${JSON.stringify(cookieStr)}`);
		}
	}

	async cookies(): Promise<Array<{ name: string; value: string }>> {
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

	// ---------------------------------------------------------------------------
	// Screencast
	// ---------------------------------------------------------------------------

	async startScreencast(options: ScreencastOptions = {}): Promise<Screencast> {
		const screencast = new Screencast(this.view, options);
		await screencast.start();
		return screencast;
	}

	// ---------------------------------------------------------------------------
	// Lifecycle
	// ---------------------------------------------------------------------------

	async close(): Promise<void> {
		(this.view as any)[Symbol.dispose]?.();
	}
}

// ---------------------------------------------------------------------------
// Key definitions
// ---------------------------------------------------------------------------

const KEY_DEFINITIONS: Record<string, { keyCode: number; key: string; code: string }> = {
	Enter: { keyCode: 13, key: "Enter", code: "Enter" },
	Tab: { keyCode: 9, key: "Tab", code: "Tab" },
	Backspace: { keyCode: 8, key: "Backspace", code: "Backspace" },
	Delete: { keyCode: 46, key: "Delete", code: "Delete" },
	Escape: { keyCode: 27, key: "Escape", code: "Escape" },
	ArrowUp: { keyCode: 38, key: "ArrowUp", code: "ArrowUp" },
	ArrowDown: { keyCode: 40, key: "ArrowDown", code: "ArrowDown" },
	ArrowLeft: { keyCode: 37, key: "ArrowLeft", code: "ArrowLeft" },
	ArrowRight: { keyCode: 39, key: "ArrowRight", code: "ArrowRight" },
	Home: { keyCode: 36, key: "Home", code: "Home" },
	End: { keyCode: 35, key: "End", code: "End" },
	PageUp: { keyCode: 33, key: "PageUp", code: "PageUp" },
	PageDown: { keyCode: 34, key: "PageDown", code: "PageDown" },
	Space: { keyCode: 32, key: " ", code: "Space" },
	Control: { keyCode: 17, key: "Control", code: "ControlLeft" },
	Shift: { keyCode: 16, key: "Shift", code: "ShiftLeft" },
	Alt: { keyCode: 18, key: "Alt", code: "AltLeft" },
	Meta: { keyCode: 91, key: "Meta", code: "MetaLeft" },
	F1: { keyCode: 112, key: "F1", code: "F1" },
	F2: { keyCode: 113, key: "F2", code: "F2" },
	F3: { keyCode: 114, key: "F3", code: "F3" },
	F4: { keyCode: 115, key: "F4", code: "F4" },
	F5: { keyCode: 116, key: "F5", code: "F5" },
	F6: { keyCode: 117, key: "F6", code: "F6" },
	F7: { keyCode: 118, key: "F7", code: "F7" },
	F8: { keyCode: 119, key: "F8", code: "F8" },
	F9: { keyCode: 120, key: "F9", code: "F9" },
	F10: { keyCode: 121, key: "F10", code: "F10" },
	F11: { keyCode: 122, key: "F11", code: "F11" },
	F12: { keyCode: 123, key: "F12", code: "F12" },
};

// ---------------------------------------------------------------------------
// Env defaults
// ---------------------------------------------------------------------------

export function resolveEnvDefaults(env: NodeJS.ProcessEnv): Partial<PageOptions> {
	const defaults: Partial<PageOptions> = {};
	if (env.THRALL_BROWSER) defaults.executablePath = env.THRALL_BROWSER;
	if (env.THRALL_ARGS) {
		defaults.args = env.THRALL_ARGS.split(",").map((a) => a.trim()).filter(Boolean);
	}
	return defaults;
}

// ---------------------------------------------------------------------------
// Launch
// ---------------------------------------------------------------------------

export async function launch(options: PageOptions = {}): Promise<Page> {
	const envDefaults = resolveEnvDefaults(process.env);
	const width = options.width ?? 1280;
	const height = options.height ?? 720;
	const timeout = options.timeout ?? 30000;
	const executablePath = options.executablePath ?? envDefaults.executablePath;
	const args = options.args ?? envDefaults.args;

	const config: Record<string, unknown> = { width, height };

	if (executablePath) {
		config.backend = { type: "chrome", path: executablePath, argv: args };
	}

	const view = new Bun.WebView(config);
	return new Page(view, width, height, timeout);
}
