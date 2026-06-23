import { afterEach, describe, expect, it, spyOn, vi } from "bun:test";
import { DapClient } from "../../src/dap/client";
import { DapSessionManager } from "../../src/dap/session";
import { TCP_TEST_ADAPTER, TcpFakeDapClient } from "./helpers/tcp-fake";

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe("DapSessionManager TCP session registration (Bug 1)", () => {
	it("does not crash when the TCP client has proc = null", async () => {
		const manager = new DapSessionManager();
		const fake = new TcpFakeDapClient(TCP_TEST_ADAPTER, process.cwd());
		spyOn(DapClient, "connectTcp").mockResolvedValue(fake as unknown as DapClient);

		// Before the fix this threw "null is not an object (evaluating
		// 'client.proc.exited')" inside #registerSession.
		const snapshot = await manager.attachTcp({
			adapter: TCP_TEST_ADAPTER,
			cwd: process.cwd(),
			host: "127.0.0.1",
			port: 12345,
		});

		expect(snapshot.adapter).toBe("jdtls");
		expect(manager.listSessions()).toHaveLength(1);
	});

	it("self-clears the heartbeat and terminates the session when isAlive becomes false", async () => {
		vi.useFakeTimers();
		const manager = new DapSessionManager();
		const fake = new TcpFakeDapClient(TCP_TEST_ADAPTER, process.cwd());
		spyOn(DapClient, "connectTcp").mockResolvedValue(fake as unknown as DapClient);

		await manager.attachTcp({
			adapter: TCP_TEST_ADAPTER,
			cwd: process.cwd(),
			host: "127.0.0.1",
			port: 12345,
		});

		expect(manager.listSessions()[0]!.status).not.toBe("terminated");

		fake.setAlive(false);
		// HEARTBEAT_INTERVAL_MS is 5000 (session.ts line 101).
		vi.advanceTimersByTime(5001);

		expect(manager.listSessions()[0]!.status).toBe("terminated");
	});
});
