/**
 * ElementHandle - represents a DOM element backed by Bun.WebView
 */

import type { Page } from "./page";

export class ElementHandle {
	constructor(
		private page: Page,
		private selector: string,
		private index: number = 0,
	) {}

	private resolve(): string {
		if (this.index === 0) {
			return `document.querySelector(${JSON.stringify(this.selector)})`;
		}
		return `document.querySelectorAll(${JSON.stringify(this.selector)})[${this.index}]`;
	}

	async click(): Promise<void> {
		await this.page._eval<void>(`${this.resolve()}.click()`);
	}

	/** Click element natively to establish WebView focus (for type/fill). */
	private async _nativeClick(): Promise<void> {
		if (this.index === 0) {
			await this.page.view.click(this.selector);
		} else {
			// For nth elements, use JS click + focus
			await this.page._eval<void>(`(() => {
				const el = ${this.resolve()};
				if (el) { el.focus(); el.click(); }
			})()`);
		}
	}

	async type(text: string, options: { delay?: number } = {}): Promise<void> {
		const { delay = 0 } = options;
		await this._nativeClick();
		if (delay === 0) {
			await this.page.view.type(text);
		} else {
			for (const char of text) {
				await this.page.view.press(char);
				if (delay > 0) await Bun.sleep(delay);
			}
		}
	}

	async fill(value: string): Promise<void> {
		await this._nativeClick();
		await this.page._eval<void>(
			`(() => {
				const el = ${this.resolve()};
				el.value = ${JSON.stringify(value)};
				el.dispatchEvent(new Event('input', { bubbles: true }));
				el.dispatchEvent(new Event('change', { bubbles: true }));
			})()`,
		);
	}

	async humanType(text: string, options: { delay?: number } = {}): Promise<void> {
		const { delay = 40 } = options;
		await this.focus();

		await this.page._eval<void>(
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

	async focus(): Promise<void> {
		await this.page._eval<void>(`${this.resolve()}.focus()`);
	}

	async hover(): Promise<void> {
		await this.page._eval<void>(
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
		return this.page._eval<string | null>(`${this.resolve()}?.textContent ?? null`);
	}

	async innerText(): Promise<string> {
		return this.page._eval<string>(`${this.resolve()}.innerText`);
	}

	async innerHTML(): Promise<string> {
		return this.page._eval<string>(`${this.resolve()}.innerHTML`);
	}

	async getAttribute(name: string): Promise<string | null> {
		return this.page._eval<string | null>(
			`${this.resolve()}?.getAttribute(${JSON.stringify(name)}) ?? null`,
		);
	}

	async isVisible(): Promise<boolean> {
		return this.page._eval<boolean>(
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

	async isChecked(): Promise<boolean> {
		return this.page._eval<boolean>(`!!${this.resolve()}.checked`);
	}

	async isDisabled(): Promise<boolean> {
		return this.page._eval<boolean>(`!!${this.resolve()}.disabled`);
	}

	async isEditable(): Promise<boolean> {
		return this.page._eval<boolean>(
			`(() => {
				const el = ${this.resolve()};
				if (!el) return false;
				if (el.disabled || el.readOnly) return false;
				const tag = el.tagName.toLowerCase();
				return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
			})()`,
		);
	}

	async inputValue(): Promise<string> {
		return this.page._eval<string>(`${this.resolve()}.value ?? ''`);
	}

	async check(): Promise<void> {
		const checked = await this.isChecked();
		if (!checked) await this.click();
	}

	async uncheck(): Promise<void> {
		const checked = await this.isChecked();
		if (checked) await this.click();
	}

	async selectOption(
		value: string | string[] | { label?: string; value?: string; index?: number },
	): Promise<void> {
		const opts = Array.isArray(value) ? value.map((v) => ({ value: v }))
			: typeof value === "string" ? [{ value }]
			: [value];

		await this.page._eval<void>(
			`(() => {
				const sel = ${this.resolve()};
				const opts = ${JSON.stringify(opts)};
				for (const opt of opts) {
					for (const o of sel.options) {
						const match = (opt.value !== undefined && o.value === opt.value)
							|| (opt.label !== undefined && o.label === opt.label)
							|| (opt.index !== undefined && o.index === opt.index);
						if (match) { o.selected = true; break; }
					}
				}
				sel.dispatchEvent(new Event('input', { bubbles: true }));
				sel.dispatchEvent(new Event('change', { bubbles: true }));
			})()`,
		);
	}

	async boundingBox(): Promise<{
		x: number;
		y: number;
		width: number;
		height: number;
	} | null> {
		return this.page._eval<{
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
		await this.page._eval<void>(
			`${this.resolve()}?.scrollIntoView({ block: 'center' })`,
		);

		const blob = await this.page.view.screenshot({ format: "png" });
		const buffer = Buffer.from(await blob.arrayBuffer());

		if (options.path) {
			await Bun.write(options.path, buffer);
		}

		return buffer;
	}
}
