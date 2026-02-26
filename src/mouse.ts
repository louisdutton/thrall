/**
 * Mouse - mouse input handling
 */

import type { CDPSession } from "./cdp";

type MouseButton = "left" | "right" | "middle";

export class Mouse {
	private x = 0;
	private y = 0;
	private button: MouseButton = "left";

	constructor(private cdp: CDPSession) {}

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

			await this.cdp.send("Input.dispatchMouseEvent", {
				type: "mouseMoved",
				x: currentX,
				y: currentY,
			});
		}

		this.x = x;
		this.y = y;
	}

	async down(
		options: { button?: MouseButton; clickCount?: number } = {},
	): Promise<void> {
		const { button = "left", clickCount = 1 } = options;
		this.button = button;

		await this.cdp.send("Input.dispatchMouseEvent", {
			type: "mousePressed",
			x: this.x,
			y: this.y,
			button,
			clickCount,
		});
	}

	async up(
		options: { button?: MouseButton; clickCount?: number } = {},
	): Promise<void> {
		const { button = this.button, clickCount = 1 } = options;

		await this.cdp.send("Input.dispatchMouseEvent", {
			type: "mouseReleased",
			x: this.x,
			y: this.y,
			button,
			clickCount,
		});
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

		await this.cdp.send("Input.dispatchMouseEvent", {
			type: "mouseWheel",
			x: this.x,
			y: this.y,
			deltaX,
			deltaY,
		});
	}
}
