import { afterEach, describe, expect, it, spyOn, vi } from "bun:test";
import { DapClient } from "../../src/dap/client";
import { DapSessionManager } from "../../src/dap/session";
import { TCP_TEST_ADAPTER, TcpFakeDapClient } from "./helpers/tcp-fake";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("DapSessionManager stackTrace thread_id (Bug 3)", () => {
	it("passes caller-specified thread_id to the stackTrace DAP request", async () => {
		const manager = new DapSessionManager();
		const fake = new TcpFakeDapClient(TCP_TEST_ADAPTER, process.cwd());
		spyOn(DapClient, "connectTcp").mockResolvedValue(fake as unknown as DapClient);

		let capturedArgs: unknown;
		fake.setSendRequestHandler((command, args) => {
			if (command === "stackTrace") capturedArgs = args;
			if (command === "threads") return { threads: [{ id: 1, name: "main" }] };
			return {};
		});

		await manager.attachTcp({
			adapter: TCP_TEST_ADAPTER,
			cwd: process.cwd(),
			host: "127.0.0.1",
			port: 12345,
		});

		await manager.stackTrace(undefined, 30);

		expect((capturedArgs as { threadId: number }).threadId).toBe(30);
	});

	it("falls back to resolved threadId when thread_id is not specified", async () => {
		const manager = new DapSessionManager();
		const fake = new TcpFakeDapClient(TCP_TEST_ADAPTER, process.cwd());
		spyOn(DapClient, "connectTcp").mockResolvedValue(fake as unknown as DapClient);

		let capturedArgs: unknown;
		fake.setSendRequestHandler((command, args) => {
			if (command === "stackTrace") capturedArgs = args;
			if (command === "threads") return { threads: [{ id: 1, name: "main" }] };
			return {};
		});

		await manager.attachTcp({
			adapter: TCP_TEST_ADAPTER,
			cwd: process.cwd(),
			host: "127.0.0.1",
			port: 12345,
		});

		await manager.stackTrace(undefined, undefined);

		expect((capturedArgs as { threadId: number }).threadId).toBe(1);
	});
});
