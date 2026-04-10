/**
 * ElementHandle - represents a DOM element backed by Bun.WebView
 */

/** Serialized evaluate function to avoid "already pending" conflicts */
export type EvalFn = <T>(expression: string) => Promise<T>;

export class ElementHandle {
	constructor(
		private view: InstanceType<typeof Bun.WebView>,
		private selector: string,
		private index: number = 0,
		private _eval?: EvalFn,
	) {}

	private eval<T>(expression: string): Promise<T> {
		if (this._eval) return this._eval<T>(expression);
		return this.view.evaluate(expression) as Promise<T>;
	}

	private resolve(): string {
		if (this.index === 0) {
			return `document.querySelector(${JSON.stringify(this.selector)})`;
		}
		return `document.querySelectorAll(${JSON.stringify(this.selector)})[${this.index}]`;
	}

	async click(): Promise<void> {
		await this.eval<void>(`${this.resolve()}.click()`);
	}

	async type(text: string, options: { delay?: number } = {}): Promise<void> {
		const { delay = 0 } = options;

		await this.focus();

		for (const char of text) {
			await this.view.press(char);

			if (delay > 0) {
				await Bun.sleep(delay);
			}
		}
	}

	async humanType(
		text: string,
		options: { delay?: number } = {},
	): Promise<void> {
		const { delay = 40 } = options;
		await this.focus();

		await this.eval<void>(
			`(async () => {
				const el = ${this.resolve()};
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

	async fill(value: string): Promise<void> {
		await this.focus();

		await this.eval<void>(
			`(() => {
				const el = ${this.resolve()};
				el.value = '';
				el.value = ${JSON.stringify(value)};
				el.dispatchEvent(new Event('input', { bubbles: true }));
				el.dispatchEvent(new Event('change', { bubbles: true }));
			})()`,
		);
	}

	async focus(): Promise<void> {
		await this.eval<void>(`${this.resolve()}.focus()`);
	}

	async hover(): Promise<void> {
		await this.eval<void>(
			`(() => {
				const el = ${this.resolve()};
				if (!el) return;
				const rect = el.getBoundingClientRect();
				const x = rect.x + rect.width / 2;
				const y = rect.y + rect.height / 2;
				el.dispatchEvent(new MouseEvent('mouseover', {
					clientX: x, clientY: y, bubbles: true, cancelable: true,
				}));
				el.dispatchEvent(new MouseEvent('mouseenter', {
					clientX: x, clientY: y, bubbles: false, cancelable: false,
				}));
				el.dispatchEvent(new MouseEvent('mousemove', {
					clientX: x, clientY: y, bubbles: true, cancelable: true,
				}));
			})()`,
		);
	}

	async textContent(): Promise<string | null> {
		return this.eval<string | null>(`${this.resolve()}?.textContent ?? null`);
	}

	async innerText(): Promise<string> {
		return this.eval<string>(`${this.resolve()}.innerText`);
	}

	async innerHTML(): Promise<string> {
		return this.eval<string>(`${this.resolve()}.innerHTML`);
	}

	async getAttribute(name: string): Promise<string | null> {
		return this.eval<string | null>(
			`${this.resolve()}?.getAttribute(${JSON.stringify(name)}) ?? null`,
		);
	}

	async isVisible(): Promise<boolean> {
		return this.eval<boolean>(
			`(() => {
				const el = ${this.resolve()};
				if (!el) return false;
				const style = window.getComputedStyle(el);
				return style.display !== 'none'
					&& style.visibility !== 'hidden'
					&& style.opacity !== '0'
					&& el.offsetWidth > 0
					&& el.offsetHeight > 0;
			})()`,
		);
	}

	async boundingBox(): Promise<{
		x: number;
		y: number;
		width: number;
		height: number;
	} | null> {
		return this.eval<{
			x: number;
			y: number;
			width: number;
			height: number;
		} | null>(
			`(() => {
				const el = ${this.resolve()};
				if (!el) return null;
				const rect = el.getBoundingClientRect();
				if (rect.width === 0 && rect.height === 0) return null;
				return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
			})()`,
		);
	}

	async screenshot(options: { path?: string } = {}): Promise<Buffer> {
		// Scroll element into view and take a viewport screenshot
		await this.eval<void>(
			`${this.resolve()}?.scrollIntoView({ block: 'center' })`,
		);

		const blob = await this.view.screenshot({ format: "png" });
		const buffer = Buffer.from(await blob.arrayBuffer());

		if (options.path) {
			await Bun.write(options.path, buffer);
		}

		return buffer;
	}
}
