/**
 * Chrome DevTools Protocol client
 */

type CDPCallback = (params: any) => void;

export class CDPSession {
	private ws: WebSocket;
	private id = 0;
	private callbacks = new Map<
		number,
		{ resolve: (v: unknown) => void; reject: (e: Error) => void }
	>();
	private eventListeners = new Map<string, Set<CDPCallback>>();
	private ready: Promise<void>;

	constructor(url: string) {
		this.ws = new WebSocket(url);
		this.ready = new Promise((resolve, reject) => {
			this.ws.onopen = () => resolve();
			this.ws.onerror = (e) => reject(new Error(`WebSocket error: ${e}`));
		});
		this.ws.onmessage = (event) => this.handleMessage(event.data);
	}

	private handleMessage(data: string) {
		const msg = JSON.parse(data);

		if (msg.id !== undefined) {
			const callback = this.callbacks.get(msg.id);
			if (callback) {
				this.callbacks.delete(msg.id);
				if (msg.error) {
					callback.reject(new Error(msg.error.message));
				} else {
					callback.resolve(msg.result);
				}
			}
		} else if (msg.method) {
			const listeners = this.eventListeners.get(msg.method);
			if (listeners) {
				for (const listener of listeners) {
					listener(msg.params);
				}
			}
		}
	}

	async send<T = unknown>(
		method: string,
		params: Record<string, unknown> = {},
	): Promise<T> {
		await this.ready;
		const id = ++this.id;

		return new Promise((resolve, reject) => {
			this.callbacks.set(id, {
				resolve: resolve as (v: unknown) => void,
				reject,
			});
			this.ws.send(JSON.stringify({ id, method, params }));
		});
	}

	on(event: string, callback: CDPCallback) {
		if (!this.eventListeners.has(event)) {
			this.eventListeners.set(event, new Set());
		}
		this.eventListeners.get(event)!.add(callback);
	}

	off(event: string, callback: CDPCallback) {
		this.eventListeners.get(event)?.delete(callback);
	}

	close() {
		// Reject any pending callbacks
		for (const [, callback] of this.callbacks) {
			callback.reject(new Error("Connection closed"));
		}
		this.callbacks.clear();
		this.eventListeners.clear();

		// Terminate immediately (Bun WebSocket method)
		(this.ws as WebSocket & { terminate: () => void }).terminate();
	}
}
