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

describe("DapSessionManager breakpoint event handler (Bug 1 & 4)", () => {
	it("updates cached source breakpoint when a changed event arrives", async () => {
		const { manager, fake } = await attachFake();

		fake.setSendRequestHandler(command => {
			if (command === "setBreakpoints") {
				return { breakpoints: [{ id: 10, verified: false, message: "pending" }] };
			}
			return {};
		});

		const result = await manager.setBreakpoint("src/Test.kt", 42);
		expect(result.breakpoints[0]!.verified).toBe(false);
		expect(result.breakpoints[0]!.message).toBe("pending");

		fake.emit("breakpoint", {
			reason: "changed",
			breakpoint: { id: 10, verified: true, line: 42 },
		});

		expect(result.breakpoints[0]!.verified).toBe(true);
		expect(result.breakpoints[0]!.message).toBeUndefined();
	});

	it("updates cached function breakpoint when a changed event arrives", async () => {
		const { manager, fake } = await attachFake();

		fake.setSendRequestHandler(command => {
			if (command === "setFunctionBreakpoints") {
				return { breakpoints: [{ id: 20, verified: false, message: "pending" }] };
			}
			return {};
		});

		const result = await manager.setFunctionBreakpoint("restart");
		expect(result.breakpoints[0]!.verified).toBe(false);

		fake.emit("breakpoint", {
			reason: "changed",
			breakpoint: { id: 20, verified: true },
		});

		expect(result.breakpoints[0]!.verified).toBe(true);
		expect(result.breakpoints[0]!.message).toBeUndefined();
	});

	it("ignores breakpoint events with no id", async () => {
		const { manager, fake } = await attachFake();

		fake.setSendRequestHandler(command => {
			if (command === "setBreakpoints") {
				return { breakpoints: [{ id: 10, verified: false }] };
			}
			return {};
		});

		const result = await manager.setBreakpoint("src/Test.kt", 42);

		fake.emit("breakpoint", {
			reason: "changed",
			breakpoint: { verified: true },
		});

		expect(result.breakpoints[0]!.verified).toBe(false);
	});

	it("does not match breakpoints by a different id", async () => {
		const { manager, fake } = await attachFake();

		fake.setSendRequestHandler(command => {
			if (command === "setBreakpoints") {
				return { breakpoints: [{ id: 10, verified: false }] };
			}
			return {};
		});

		const result = await manager.setBreakpoint("src/Test.kt", 42);

		fake.emit("breakpoint", {
			reason: "changed",
			breakpoint: { id: 999, verified: true },
		});

		expect(result.breakpoints[0]!.verified).toBe(false);
	});
});
