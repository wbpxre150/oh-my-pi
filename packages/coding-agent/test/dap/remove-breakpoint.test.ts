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

describe("DapSessionManager removeBreakpoint (Bug #2 regression)", () => {
	it("removes only the breakpoint at the specified line, keeping others", async () => {
		const { manager, fake } = await attachFake();

		const sentRequests: { lines: number[] }[] = [];
		fake.setSendRequestHandler((command, args) => {
			if (command === "setBreakpoints") {
				const lines = (args as { breakpoints?: Array<{ line: number }> })?.breakpoints?.map(b => b.line) ?? [];
				sentRequests.push({ lines });
				return {
					breakpoints: lines.map(line => ({ verified: true, line })),
				};
			}
			return {};
		});

		await manager.setBreakpoint("src/DaemonService.kt", 168);
		await manager.setBreakpoint("src/DaemonService.kt", 185);

		const result = await manager.removeBreakpoint("src/DaemonService.kt", 168);

		expect(result.breakpoints).toHaveLength(1);
		expect(result.breakpoints[0]!.line).toBe(185);

		const lastRequest = sentRequests[sentRequests.length - 1]!;
		expect(lastRequest.lines).toEqual([185]);
	});

	it("deletes the file entry when the last breakpoint is removed", async () => {
		const { manager, fake } = await attachFake();

		fake.setSendRequestHandler((command, args) => {
			if (command === "setBreakpoints") {
				const lines = (args as { breakpoints?: Array<{ line: number }> })?.breakpoints?.map(b => b.line) ?? [];
				return {
					breakpoints: lines.map(line => ({ verified: true, line })),
				};
			}
			return {};
		});

		await manager.setBreakpoint("src/Test.kt", 42);
		const result = await manager.removeBreakpoint("src/Test.kt", 42);

		expect(result.breakpoints).toHaveLength(0);
	});
});

describe("DapSessionManager Kotlin breakpoint warning (Bug #1)", () => {
	it("includes warning when setting a .kt breakpoint with known JVM mismatch", async () => {
		const { manager, fake } = await attachFake();

		fake.emit("output", {
			output: "Debugger JVM version: 21.0.11\nDebuggee JVM version: 8\n",
		});

		fake.setSendRequestHandler(command => {
			if (command === "setBreakpoints") {
				return { breakpoints: [{ verified: true, line: 185 }] };
			}
			return {};
		});

		const result = await manager.setBreakpoint("src/DaemonService.kt", 185);

		expect(result.warning).toBeDefined();
		expect(result.warning).toContain("JVM version mismatch");
		expect(result.warning).toContain("debugger JVM 21.0.11 vs debuggee JVM 8");
		expect(result.warning).toContain("Kotlin");
	});

	it("does not include warning for .java files even with JVM mismatch", async () => {
		const { manager, fake } = await attachFake();

		fake.emit("output", {
			output: "Debugger JVM version: 21.0.11\nDebuggee JVM version: 8\n",
		});

		fake.setSendRequestHandler(command => {
			if (command === "setBreakpoints") {
				return { breakpoints: [{ verified: true, line: 42 }] };
			}
			return {};
		});

		const result = await manager.setBreakpoint("src/MainActivity.java", 42);

		expect(result.warning).toBeUndefined();
	});

	it("does not include warning for .kt files without JVM mismatch", async () => {
		const { manager, fake } = await attachFake();

		fake.setSendRequestHandler(command => {
			if (command === "setBreakpoints") {
				return { breakpoints: [{ verified: true, line: 185 }] };
			}
			return {};
		});

		const result = await manager.setBreakpoint("src/DaemonService.kt", 185);

		expect(result.warning).toBeUndefined();
	});
});
