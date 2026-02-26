/**
 * ElementHandle - represents a DOM element
 */

import type { CDPSession } from "./cdp";

type Quad = [number, number, number, number, number, number, number, number];

interface BoxModel {
	content: Quad;
	padding: Quad;
	border: Quad;
	margin: Quad;
	width: number;
	height: number;
}

export class ElementHandle {
	constructor(
		private cdp: CDPSession,
		private nodeId: number,
	) {}

	async click(): Promise<void> {
		await this.cdp.send("Runtime.callFunctionOn", {
			objectId: await this.getObjectId(),
			functionDeclaration: "function() { this.click(); }",
		});
	}

	async type(text: string, options: { delay?: number } = {}): Promise<void> {
		const { delay = 0 } = options;

		await this.focus();

		for (const char of text) {
			await this.cdp.send("Input.dispatchKeyEvent", {
				type: "keyDown",
				text: char,
			});
			await this.cdp.send("Input.dispatchKeyEvent", {
				type: "keyUp",
				text: char,
			});

			if (delay > 0) {
				await Bun.sleep(delay);
			}
		}
	}

	async fill(value: string): Promise<void> {
		await this.focus();

		// Clear existing content
		await this.cdp.send("Runtime.callFunctionOn", {
			objectId: await this.getObjectId(),
			functionDeclaration: `function() { this.value = ''; }`,
		});

		// Set new value
		await this.cdp.send("Runtime.callFunctionOn", {
			objectId: await this.getObjectId(),
			functionDeclaration: `function(value) {
        this.value = value;
        this.dispatchEvent(new Event('input', { bubbles: true }));
        this.dispatchEvent(new Event('change', { bubbles: true }));
      }`,
			arguments: [{ value }],
		});
	}

	async focus(): Promise<void> {
		await this.cdp.send("DOM.focus", { nodeId: this.nodeId });
	}

	async hover(): Promise<void> {
		const { model } = await this.cdp.send<{ model: BoxModel }>(
			"DOM.getBoxModel",
			{
				nodeId: this.nodeId,
			},
		);

		const [x1, y1, , , x3, y3] = model.content;
		const x = (x1 + x3) / 2;
		const y = (y1 + y3) / 2;

		await this.cdp.send("Input.dispatchMouseEvent", {
			type: "mouseMoved",
			x,
			y,
		});
	}

	async textContent(): Promise<string | null> {
		const result = await this.cdp.send<{ result: { value: string | null } }>(
			"Runtime.callFunctionOn",
			{
				objectId: await this.getObjectId(),
				functionDeclaration: "function() { return this.textContent; }",
				returnByValue: true,
			},
		);
		return result.result.value;
	}

	async innerText(): Promise<string> {
		const result = await this.cdp.send<{ result: { value: string } }>(
			"Runtime.callFunctionOn",
			{
				objectId: await this.getObjectId(),
				functionDeclaration: "function() { return this.innerText; }",
				returnByValue: true,
			},
		);
		return result.result.value;
	}

	async innerHTML(): Promise<string> {
		const result = await this.cdp.send<{ result: { value: string } }>(
			"Runtime.callFunctionOn",
			{
				objectId: await this.getObjectId(),
				functionDeclaration: "function() { return this.innerHTML; }",
				returnByValue: true,
			},
		);
		return result.result.value;
	}

	async getAttribute(name: string): Promise<string | null> {
		const result = await this.cdp.send<{ result: { value: string | null } }>(
			"Runtime.callFunctionOn",
			{
				objectId: await this.getObjectId(),
				functionDeclaration: `function() { return this.getAttribute("${name}"); }`,
				returnByValue: true,
			},
		);
		return result.result.value;
	}

	async isVisible(): Promise<boolean> {
		const result = await this.cdp.send<{ result: { value: boolean } }>(
			"Runtime.callFunctionOn",
			{
				objectId: await this.getObjectId(),
				functionDeclaration: `function() {
          const style = window.getComputedStyle(this);
          return style.display !== 'none'
            && style.visibility !== 'hidden'
            && style.opacity !== '0'
            && this.offsetWidth > 0
            && this.offsetHeight > 0;
        }`,
				returnByValue: true,
			},
		);
		return result.result.value;
	}

	async boundingBox(): Promise<{
		x: number;
		y: number;
		width: number;
		height: number;
	} | null> {
		try {
			const { model } = await this.cdp.send<{ model: BoxModel }>(
				"DOM.getBoxModel",
				{
					nodeId: this.nodeId,
				},
			);

			const [x1, y1, x2, , x3, y3] = model.content;
			return {
				x: x1,
				y: y1,
				width: x2 - x1,
				height: y3 - y1,
			};
		} catch {
			return null;
		}
	}

	async screenshot(options: { path?: string } = {}): Promise<Buffer> {
		const box = await this.boundingBox();
		if (!box) throw new Error("Element is not visible");

		const result = await this.cdp.send<{ data: string }>(
			"Page.captureScreenshot",
			{
				format: "png",
				clip: {
					x: box.x,
					y: box.y,
					width: box.width,
					height: box.height,
					scale: 1,
				},
			},
		);

		const buffer = Buffer.from(result.data, "base64");

		if (options.path) {
			await Bun.write(options.path, buffer);
		}

		return buffer;
	}

	private async getObjectId(): Promise<string> {
		const { object } = await this.cdp.send<{ object: { objectId: string } }>(
			"DOM.resolveNode",
			{ nodeId: this.nodeId },
		);
		return object.objectId;
	}
}
