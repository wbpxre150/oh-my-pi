import { afterEach, describe, expect, it, spyOn, vi } from "bun:test";
import { DapClient } from "../../src/dap/client";
import { DapSessionManager } from "../../src/dap/session";
import { TCP_TEST_ADAPTER, TcpFakeDapClient } from "./helpers/tcp-fake";

afterEach(() => {
	vi.restoreAllMocks();
});

async function attachFake(): Promise<{ manager: DapSessionManager; fake: TcpFakeDapClient }> {
	const manager = new DapSessionManager();
	const fake = new TcpFakeDapClient(TCP_TEST_ADAPTER, process.cwd());
	spyOn(DapClient, "connectTcp").mockResolvedValue(fake as unknown as DapClient);
	await manager.attachTcp({
		adapter: TCP_TEST_ADAPTER,
		cwd: process.cwd(),
		host: "127.0.0.1",
		port: 12345,
	});
	return { manager, fake };
}

describe("DapSessionManager JVM version mismatch detection", () => {
	it("detects JVM mismatch from output events and surfaces it in session summary", async () => {
		const { manager, fake } = await attachFake();

		fake.emit("output", { output: "The debugger and the debuggee are running in different versions of JVMs.\n" });
		fake.emit("output", { output: "You could see wrong source mapping results.\n" });
		fake.emit("output", { output: "Debugger JVM version: 21.0.11\n" });
		fake.emit("output", { output: "Debuggee JVM version: 8\n" });

		const snapshot = manager.getActiveSession();
		expect(snapshot?.jvmVersionMismatch).toBe("debugger JVM 21.0.11 vs debuggee JVM 8");
	});

	it("does not set jvmVersionMismatch when no mismatch warning is emitted", async () => {
		const { manager, fake } = await attachFake();

		fake.emit("output", { output: "Some other console output\n" });

		const snapshot = manager.getActiveSession();
		expect(snapshot?.jvmVersionMismatch).toBeUndefined();
	});

	it("detects mismatch even when version lines arrive in a single output event", async () => {
		const { manager, fake } = await attachFake();

		fake.emit("output", {
			output: "Debugger JVM version: 21.0.11\nDebuggee JVM version: 8\n",
		});

		const snapshot = manager.getActiveSession();
		expect(snapshot?.jvmVersionMismatch).toBe("debugger JVM 21.0.11 vs debuggee JVM 8");
	});
});
