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

describe("DapSessionManager function breakpoint warning (Bug #1)", () => {
	it("includes warning when setting a function breakpoint with known JVM mismatch", async () => {
		const { manager, fake } = await attachFake();

		fake.emit("output", {
			output: "Debugger JVM version: 21.0.11\nDebuggee JVM version: 8\n",
		});

		fake.setSendRequestHandler(command => {
			if (command === "setFunctionBreakpoints") {
				return { breakpoints: [{ verified: true }] };
			}
			return {};
		});

		const result = await manager.setFunctionBreakpoint("getSafStatus");

		expect(result.warning).toBeDefined();
		expect(result.warning).toContain("JVM version mismatch");
		expect(result.warning).toContain("Function breakpoints");
	});

	it("does not include warning without JVM mismatch", async () => {
		const { manager, fake } = await attachFake();

		fake.setSendRequestHandler(command => {
			if (command === "setFunctionBreakpoints") {
				return { breakpoints: [{ verified: true }] };
			}
			return {};
		});

		const result = await manager.setFunctionBreakpoint("getSafStatus");

		expect(result.warning).toBeUndefined();
	});

	it("includes warning when removing a function breakpoint with remaining breakpoints and JVM mismatch", async () => {
		const { manager, fake } = await attachFake();

		fake.emit("output", {
			output: "Debugger JVM version: 21.0.11\nDebuggee JVM version: 8\n",
		});

		fake.setSendRequestHandler(command => {
			if (command === "setFunctionBreakpoints") {
				return { breakpoints: [{ verified: true }] };
			}
			return {};
		});

		await manager.setFunctionBreakpoint("getSafStatus");
		await manager.setFunctionBreakpoint("restartDaemon");

		const result = await manager.removeFunctionBreakpoint("getSafStatus");

		expect(result.warning).toBeDefined();
		expect(result.warning).toContain("JVM version mismatch");
	});

	it("does not include warning when removing the last function breakpoint even with JVM mismatch", async () => {
		const { manager, fake } = await attachFake();

		fake.emit("output", {
			output: "Debugger JVM version: 21.0.11\nDebuggee JVM version: 8\n",
		});

		fake.setSendRequestHandler(command => {
			if (command === "setFunctionBreakpoints") {
				return { breakpoints: [] };
			}
			return {};
		});

		await manager.setFunctionBreakpoint("getSafStatus");
		const result = await manager.removeFunctionBreakpoint("getSafStatus");

		expect(result.warning).toBeUndefined();
	});
});