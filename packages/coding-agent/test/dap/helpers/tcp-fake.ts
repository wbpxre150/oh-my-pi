import type { DapCapabilities, DapClientState, DapEventMessage, DapResolvedAdapter } from "../../../src/dap/types";

type DapEventHandler = (body: unknown, event: DapEventMessage) => void | Promise<void>;

/** A DapResolvedAdapter with connectMode "tcp" (JDT-LS java-debug shape). */
export const TCP_TEST_ADAPTER: DapResolvedAdapter = {
	name: "jdtls",
	command: "jdtls",
	args: [],
	resolvedCommand: "jdtls",
	languages: ["java", "kotlin"],
	fileTypes: [".java", ".kt"],
	rootMarkers: ["build.gradle"],
	launchDefaults: {},
	attachDefaults: { request: "attach", hostName: "127.0.0.1" },
	connectMode: "tcp",
	acceptsDirectoryProgram: false,
};

/** Minimal DapClient stand-in for a TCP session: `proc` is null (no child
 *  process), matching DapClient.connectTcp construction. Drives the
 *  DapSessionManager attachTcp / customRequest flows without a real socket. */
export class TcpFakeDapClient {
	readonly proc: DapClientState["proc"] = null;
	readonly #handlers = new Map<string, Set<DapEventHandler>>();
	#alive = true;
	readonly #capabilities: DapCapabilities;

	constructor(
		readonly adapter: DapResolvedAdapter,
		readonly cwd: string,
		options: { supportsConfigurationDoneRequest?: boolean } = {},
	) {
		this.#capabilities = { supportsConfigurationDoneRequest: options.supportsConfigurationDoneRequest ?? true };
	}

	setAlive(alive: boolean): void {
		this.#alive = alive;
	}

	async initialize(): Promise<DapCapabilities> {
		queueMicrotask(() => this.#emit("initialized", {}));
		return this.#capabilities;
	}

	async sendRequest(): Promise<unknown> {
		return {};
	}

	waitForEvent(event: string): Promise<unknown> {
		// No stop/terminated/exited events fire in this fake; reject immediately
		// so #prepareStopOutcome's race settles without hanging the test.
		return Promise.reject(new Error(`DAP event ${event} timed out`));
	}

	onEvent(event: string, handler: DapEventHandler): () => void {
		let handlers = this.#handlers.get(event);
		if (!handlers) {
			handlers = new Set<DapEventHandler>();
			this.#handlers.set(event, handlers);
		}
		handlers.add(handler);
		return () => {
			handlers?.delete(handler);
		};
	}

	onReverseRequest(): () => void {
		return () => {};
	}

	isAlive(): boolean {
		return this.#alive;
	}

	async dispose(): Promise<void> {
		this.#alive = false;
	}

	#emit(event: string, body: unknown): void {
		const message: DapEventMessage = { seq: 1, type: "event", event, body };
		for (const handler of this.#handlers.get(event) ?? []) {
			void handler(body, message);
		}
	}
}
