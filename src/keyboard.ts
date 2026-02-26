/**
 * Keyboard - keyboard input handling
 */

import type { CDPSession } from "./cdp";

// Key definitions for special keys
const KEY_DEFINITIONS: Record<
	string,
	{ keyCode: number; key: string; code: string }
> = {
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

export class Keyboard {
	private modifiers = 0;

	constructor(private cdp: CDPSession) {}

	async down(key: string): Promise<void> {
		const def = KEY_DEFINITIONS[key];

		if (key === "Shift") this.modifiers |= 8;
		if (key === "Control") this.modifiers |= 4;
		if (key === "Alt") this.modifiers |= 2;
		if (key === "Meta") this.modifiers |= 1;

		await this.cdp.send("Input.dispatchKeyEvent", {
			type: "keyDown",
			modifiers: this.modifiers,
			key: def?.key ?? key,
			code: def?.code ?? `Key${key.toUpperCase()}`,
			windowsVirtualKeyCode: def?.keyCode ?? key.charCodeAt(0),
		});
	}

	async up(key: string): Promise<void> {
		const def = KEY_DEFINITIONS[key];

		if (key === "Shift") this.modifiers &= ~8;
		if (key === "Control") this.modifiers &= ~4;
		if (key === "Alt") this.modifiers &= ~2;
		if (key === "Meta") this.modifiers &= ~1;

		await this.cdp.send("Input.dispatchKeyEvent", {
			type: "keyUp",
			modifiers: this.modifiers,
			key: def?.key ?? key,
			code: def?.code ?? `Key${key.toUpperCase()}`,
			windowsVirtualKeyCode: def?.keyCode ?? key.charCodeAt(0),
		});
	}

	async press(key: string): Promise<void> {
		await this.down(key);
		await this.up(key);
	}

	async type(text: string, options: { delay?: number } = {}): Promise<void> {
		const { delay = 0 } = options;

		for (const char of text) {
			if (KEY_DEFINITIONS[char]) {
				await this.press(char);
			} else {
				await this.cdp.send("Input.dispatchKeyEvent", {
					type: "keyDown",
					text: char,
				});
				await this.cdp.send("Input.dispatchKeyEvent", {
					type: "keyUp",
					text: char,
				});
			}

			if (delay > 0) {
				await Bun.sleep(delay);
			}
		}
	}
}
