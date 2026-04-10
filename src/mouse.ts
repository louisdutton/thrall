/**
 * Mouse - mouse input handling backed by Bun.WebView
 */

import type { EvalFn } from "./element";

type MouseButton = "left" | "right" | "middle";

export class Mouse {
	private x = 0;
	private y = 0;
	private button: MouseButton = "left";

	constructor(
		private view: InstanceType<typeof Bun.WebView>,
		private eval_: EvalFn,
	) {}

	async move(
		x: number,
		y: number,
		options: { steps?: number } = {},
	): Promise<void> {
		const { steps = 1 } = options;

		const fromX = this.x;
		const fromY = this.y;

		for (let i = 1; i <= steps; i++) {
			const currentX = fromX + (x - fromX) * (i / steps);
			const currentY = fromY + (y - fromY) * (i / steps);

			await this.eval_(
				`(() => {
					const el = document.elementFromPoint(${currentX}, ${currentY}) || document.body;
					el.dispatchEvent(new MouseEvent('mousemove', {
						clientX: ${currentX}, clientY: ${currentY},
						bubbles: true, cancelable: true,
					}));
				})()`,
			);
		}

		this.x = x;
		this.y = y;
	}

	async down(
		options: { button?: MouseButton; clickCount?: number } = {},
	): Promise<void> {
		const { button = "left", clickCount = 1 } = options;
		this.button = button;
		const buttonNum = button === "left" ? 0 : button === "right" ? 2 : 1;

		await this.eval_(
			`(() => {
				const el = document.elementFromPoint(${this.x}, ${this.y}) || document.body;
				el.dispatchEvent(new MouseEvent('mousedown', {
					clientX: ${this.x}, clientY: ${this.y},
					button: ${buttonNum}, detail: ${clickCount},
					bubbles: true, cancelable: true,
				}));
			})()`,
		);
	}

	async up(
		options: { button?: MouseButton; clickCount?: number } = {},
	): Promise<void> {
		const { button = this.button, clickCount = 1 } = options;
		const buttonNum = button === "left" ? 0 : button === "right" ? 2 : 1;

		await this.eval_(
			`(() => {
				const el = document.elementFromPoint(${this.x}, ${this.y}) || document.body;
				el.dispatchEvent(new MouseEvent('mouseup', {
					clientX: ${this.x}, clientY: ${this.y},
					button: ${buttonNum}, detail: ${clickCount},
					bubbles: true, cancelable: true,
				}));
			})()`,
		);
	}

	async click(
		x: number,
		y: number,
		options: { button?: MouseButton; clickCount?: number; delay?: number } = {},
	): Promise<void> {
		const { delay = 0 } = options;

		await this.move(x, y);
		await this.down(options);

		if (delay > 0) {
			await Bun.sleep(delay);
		}

		await this.up(options);
	}

	async dblclick(
		x: number,
		y: number,
		options: { button?: MouseButton; delay?: number } = {},
	): Promise<void> {
		await this.click(x, y, { ...options, clickCount: 2 });
	}

	async wheel(
		options: { deltaX?: number; deltaY?: number } = {},
	): Promise<void> {
		const { deltaX = 0, deltaY = 0 } = options;

		await this.eval_(
			`(() => {
				const el = document.elementFromPoint(${this.x}, ${this.y}) || document.body;
				el.dispatchEvent(new WheelEvent('wheel', {
					clientX: ${this.x}, clientY: ${this.y},
					deltaX: ${deltaX}, deltaY: ${deltaY},
					bubbles: true, cancelable: true,
				}));
			})()`,
		);
	}

	/**
	 * Smooth scroll by dispatching wheel events over a duration.
	 * @param deltaY - Total vertical scroll distance (positive = down)
	 * @param options.deltaX - Total horizontal scroll distance
	 * @param options.duration - Duration in ms (default: 1000)
	 */
	async smoothWheel(
		deltaY: number,
		options: { deltaX?: number; duration?: number } = {},
	): Promise<void> {
		const { deltaX = 0, duration = 1000 } = options;
		const interval = 16; // ~60fps
		const steps = Math.max(1, Math.round(duration / interval));
		const stepDeltaX = deltaX / steps;
		const stepDeltaY = deltaY / steps;

		for (let i = 0; i < steps; i++) {
			await this.wheel({ deltaX: stepDeltaX, deltaY: stepDeltaY });
			await Bun.sleep(interval);
		}
	}
}
