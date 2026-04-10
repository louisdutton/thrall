/**
 * Type declarations for Bun.WebView (introduced in Bun 1.3.12).
 * Remove once @types/bun ships these types.
 */

declare module "bun" {
	interface WebViewOptions {
		width?: number;
		height?: number;
		backend?: "chrome" | { type: "chrome"; path: string; argv?: string[] };
	}

	interface WebViewScreenshotOptions {
		format?: "png" | "jpeg" | "webp";
		quality?: number;
	}

	class WebView {
		constructor(options?: WebViewOptions);

		navigate(url: string): Promise<void>;
		evaluate(expression: string): Promise<unknown>;
		screenshot(options?: WebViewScreenshotOptions): Promise<Blob>;
		cdp(method: string, params?: Record<string, unknown>): Promise<unknown>;
		click(selector: string): Promise<void>;
		type(text: string): Promise<void>;
		press(key: string): Promise<void>;
		scroll(deltaX: number, deltaY: number): Promise<void>;
		scrollTo(selector: string): Promise<void>;
		resize(width: number, height: number): Promise<void>;
		goBack(): Promise<void>;
		goForward(): Promise<void>;
		reload(): Promise<void>;
		close(): void;

		addEventListener(event: string, handler: (event: unknown) => void): void;
		removeEventListener(event: string, handler: (event: unknown) => void): void;

		get url(): string;
		get title(): string;
		get loading(): boolean;
		get onNavigated(): ((url: string) => void) | null;
		get onNavigationFailed(): ((url: string, error: string) => void) | null;

		[Symbol.dispose](): void;
	}
}
