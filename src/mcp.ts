/**
 * MCP Server for Thrall
 */

import { launch, type Browser, type Page } from "./index";

interface JSONRPCRequest {
	jsonrpc: "2.0";
	id: number | string;
	method: string;
	params?: unknown;
}

interface JSONRPCResponse {
	jsonrpc: "2.0";
	id: number | string;
	result?: unknown;
	error?: { code: number; message: string };
}

const TOOLS = [
	{
		name: "launch",
		description: "Launch browser. Call this first.",
		inputSchema: {
			type: "object",
			properties: {
				headless: { type: "boolean", description: "Run headless (default: true)" },
			},
		},
	},
	{
		name: "close",
		description: "Close browser and cleanup.",
		inputSchema: { type: "object", properties: {} },
	},
	{
		name: "navigate",
		description: "Navigate to a URL.",
		inputSchema: {
			type: "object",
			properties: {
				url: { type: "string", description: "URL to navigate to" },
			},
			required: ["url"],
		},
	},
	{
		name: "click",
		description: "Click an element.",
		inputSchema: {
			type: "object",
			properties: {
				selector: { type: "string", description: "CSS selector" },
			},
			required: ["selector"],
		},
	},
	{
		name: "type",
		description: "Type text into an element.",
		inputSchema: {
			type: "object",
			properties: {
				selector: { type: "string", description: "CSS selector" },
				text: { type: "string", description: "Text to type" },
			},
			required: ["selector", "text"],
		},
	},
	{
		name: "fill",
		description: "Fill an input field (clears existing value).",
		inputSchema: {
			type: "object",
			properties: {
				selector: { type: "string", description: "CSS selector" },
				value: { type: "string", description: "Value to fill" },
			},
			required: ["selector", "value"],
		},
	},
	{
		name: "screenshot",
		description: "Take a screenshot. Returns base64 PNG.",
		inputSchema: {
			type: "object",
			properties: {
				fullPage: { type: "boolean", description: "Capture full page" },
			},
		},
	},
	{
		name: "get_content",
		description: "Get page HTML content.",
		inputSchema: { type: "object", properties: {} },
	},
	{
		name: "get_title",
		description: "Get page title.",
		inputSchema: { type: "object", properties: {} },
	},
	{
		name: "get_url",
		description: "Get current URL.",
		inputSchema: { type: "object", properties: {} },
	},
	{
		name: "get_text",
		description: "Get text content of an element.",
		inputSchema: {
			type: "object",
			properties: {
				selector: { type: "string", description: "CSS selector" },
			},
			required: ["selector"],
		},
	},
	{
		name: "evaluate",
		description: "Execute JavaScript in the page.",
		inputSchema: {
			type: "object",
			properties: {
				script: { type: "string", description: "JavaScript code to execute" },
			},
			required: ["script"],
		},
	},
	{
		name: "wait_for_selector",
		description: "Wait for an element to appear.",
		inputSchema: {
			type: "object",
			properties: {
				selector: { type: "string", description: "CSS selector" },
				timeout: { type: "number", description: "Timeout in ms (default: 30000)" },
			},
			required: ["selector"],
		},
	},
	{
		name: "reload",
		description: "Reload the current page.",
		inputSchema: { type: "object", properties: {} },
	},
	{
		name: "go_back",
		description: "Navigate back.",
		inputSchema: { type: "object", properties: {} },
	},
	{
		name: "go_forward",
		description: "Navigate forward.",
		inputSchema: { type: "object", properties: {} },
	},
] as const;

class MCPServer {
	private browser: Browser | null = null;
	private page: Page | null = null;

	async handleRequest(req: JSONRPCRequest): Promise<JSONRPCResponse> {
		try {
			const result = await this.dispatch(req.method, req.params);
			return { jsonrpc: "2.0", id: req.id, result };
		} catch (err) {
			return {
				jsonrpc: "2.0",
				id: req.id,
				error: { code: -32000, message: String(err) },
			};
		}
	}

	private async dispatch(method: string, params: unknown): Promise<unknown> {
		switch (method) {
			case "initialize":
				return {
					protocolVersion: "2024-11-05",
					capabilities: { tools: {} },
					serverInfo: { name: "thrall", version: "0.1.0" },
				};

			case "notifications/initialized":
				return undefined;

			case "tools/list":
				return { tools: TOOLS };

			case "tools/call":
				return this.handleToolCall(params as { name: string; arguments?: Record<string, unknown> });

			default:
				throw new Error(`Unknown method: ${method}`);
		}
	}

	private async handleToolCall(params: { name: string; arguments?: Record<string, unknown> }): Promise<unknown> {
		const { name, arguments: args = {} } = params;

		switch (name) {
			case "launch": {
				if (this.browser) await this.browser.close();
				this.browser = await launch({ headless: (args.headless as boolean) ?? true });
				this.page = await this.browser.newPage();
				return { content: [{ type: "text", text: "Browser launched" }] };
			}

			case "close": {
				if (this.browser) {
					await this.browser.close();
					this.browser = null;
					this.page = null;
				}
				return { content: [{ type: "text", text: "Browser closed" }] };
			}

			case "navigate": {
				this.requirePage();
				await this.page!.goto(args.url as string);
				return { content: [{ type: "text", text: `Navigated to ${args.url}` }] };
			}

			case "click": {
				this.requirePage();
				await this.page!.click(args.selector as string);
				return { content: [{ type: "text", text: `Clicked ${args.selector}` }] };
			}

			case "type": {
				this.requirePage();
				await this.page!.type(args.selector as string, args.text as string);
				return { content: [{ type: "text", text: `Typed into ${args.selector}` }] };
			}

			case "fill": {
				this.requirePage();
				await this.page!.fill(args.selector as string, args.value as string);
				return { content: [{ type: "text", text: `Filled ${args.selector}` }] };
			}

			case "screenshot": {
				this.requirePage();
				const buffer = await this.page!.screenshot({ fullPage: args.fullPage as boolean });
				return {
					content: [{
						type: "image",
						data: buffer.toString("base64"),
						mimeType: "image/png",
					}],
				};
			}

			case "get_content": {
				this.requirePage();
				const content = await this.page!.content();
				return { content: [{ type: "text", text: content }] };
			}

			case "get_title": {
				this.requirePage();
				const title = await this.page!.title();
				return { content: [{ type: "text", text: title }] };
			}

			case "get_url": {
				this.requirePage();
				const url = await this.page!.url();
				return { content: [{ type: "text", text: url }] };
			}

			case "get_text": {
				this.requirePage();
				const el = await this.page!.$(args.selector as string);
				if (!el) throw new Error(`Element not found: ${args.selector}`);
				const text = await el.textContent();
				return { content: [{ type: "text", text: text ?? "" }] };
			}

			case "evaluate": {
				this.requirePage();
				const result = await this.page!.evaluate(args.script as string);
				return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
			}

			case "wait_for_selector": {
				this.requirePage();
				await this.page!.waitForSelector(args.selector as string, {
					timeout: args.timeout as number,
				});
				return { content: [{ type: "text", text: `Found ${args.selector}` }] };
			}

			case "reload": {
				this.requirePage();
				await this.page!.reload();
				return { content: [{ type: "text", text: "Page reloaded" }] };
			}

			case "go_back": {
				this.requirePage();
				await this.page!.goBack();
				return { content: [{ type: "text", text: "Navigated back" }] };
			}

			case "go_forward": {
				this.requirePage();
				await this.page!.goForward();
				return { content: [{ type: "text", text: "Navigated forward" }] };
			}

			default:
				throw new Error(`Unknown tool: ${name}`);
		}
	}

	private requirePage(): void {
		if (!this.page) {
			throw new Error("Browser not launched. Call 'launch' first.");
		}
	}

	async cleanup(): Promise<void> {
		if (this.browser) {
			await this.browser.close();
		}
	}
}

export async function serve(): Promise<void> {
	const server = new MCPServer();
	const decoder = new TextDecoder();
	let buffer = "";

	process.on("SIGINT", async () => {
		await server.cleanup();
		process.exit(0);
	});

	for await (const chunk of Bun.stdin.stream()) {
		buffer += decoder.decode(chunk);

		let newlineIndex: number;
		while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
			const line = buffer.slice(0, newlineIndex).trim();
			buffer = buffer.slice(newlineIndex + 1);

			if (!line) continue;

			try {
				const req = JSON.parse(line) as JSONRPCRequest;
				const res = await server.handleRequest(req);
				if (res.result !== undefined || res.error) {
					console.log(JSON.stringify(res));
				}
			} catch (err) {
				console.log(JSON.stringify({
					jsonrpc: "2.0",
					id: null,
					error: { code: -32700, message: "Parse error" },
				}));
			}
		}
	}
}

if (import.meta.main) {
	serve();
}
