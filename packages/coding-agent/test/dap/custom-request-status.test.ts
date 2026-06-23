import { afterEach, describe, expect, it, spyOn, vi } from "bun:test";
import { DapClient } from "../../src/dap/client";
import { DapSessionManager } from "../../src/dap/session";
import { TCP_TEST_ADAPTER, TcpFakeDapClient } from "./helpers/tcp-fake";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("DapSessionManager customRequest configurationDone status (Bug 5)", () => {
	it("transitions a configuring session to running after a configurationDone custom request", async () => {
		const manager = new DapSessionManager();
		// supportsConfigurationDoneRequest = false => needsConfigurationDone = false,
		// so the auto handshake does NOT set configurationDoneSent or transition
		// status. The "initialized" event leaves the session in "configuring".
		const fake = new TcpFakeDapClient(TCP_TEST_ADAPTER, process.cwd(), {
			supportsConfigurationDoneRequest: false,
		});
		spyOn(DapClient, "connectTcp").mockResolvedValue(fake as unknown as DapClient);

		await manager.attachTcp({
			adapter: TCP_TEST_ADAPTER,
			cwd: process.cwd(),
			host: "127.0.0.1",
			port: 12345,
		});

		expect(manager.listSessions()[0]!.status).toBe("configuring");

		const result = await manager.customRequest("configurationDone", {});

		expect(result.snapshot.status).toBe("running");
		expect(manager.listSessions()[0]!.status).toBe("running");
	});

	it("does not transition a non-configuring session on configurationDone", async () => {
		const manager = new DapSessionManager();
		const fake = new TcpFakeDapClient(TCP_TEST_ADAPTER, process.cwd());
		spyOn(DapClient, "connectTcp").mockResolvedValue(fake as unknown as DapClient);

		await manager.attachTcp({
			adapter: TCP_TEST_ADAPTER,
			cwd: process.cwd(),
			host: "127.0.0.1",
			port: 12345,
		});
		// supportsConfigurationDoneRequest = true => handshake completed => running.
		expect(manager.listSessions()[0]!.status).toBe("running");

		await manager.customRequest("configurationDone", {});
		expect(manager.listSessions()[0]!.status).toBe("running");
	});
});
