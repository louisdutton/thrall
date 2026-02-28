/**
 * Thrall - Lightweight Chromium automation for Bun
 */

export { Browser } from "./browser";
export { CDPSession } from "./cdp";
export { ElementHandle } from "./element";
export { Keyboard } from "./keyboard";
export { Mouse } from "./mouse";
export { Page } from "./page";
export { Screencast } from "./screencast";

import { Browser } from "./browser";

/**
 * Launch a new browser instance
 */
export async function launch(options?: Parameters<typeof Browser.launch>[0]) {
	return Browser.launch(options);
}
