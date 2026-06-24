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

describe("DapSessionManager stackTrace empty-frame warning (Bug 3)", () => {
	it("warns when a non-stopped thread returns no frames", async () => {
		const { manager, fake } = await attachFake();

		fake.setSendRequestHandler(command => {
			if (command === "stackTrace") return { stackFrames: [], totalFrames: 0 };
			if (command === "threads") return { threads: [{ id: 1, name: "main" }] };
			return {};
		});

		fake.emit("stopped", { reason: "breakpoint", threadId: 1 });

		const result = await manager.stackTrace(undefined, 20);

		expect(result.stackFrames).toEqual([]);
		expect(result.warning).toBeDefined();
		expect(result.warning).toContain("20");
		expect(result.warning).toContain("only the stopped thread");
	});

	it("does not warn when the stopped thread itself returns frames", async () => {
		const { manager, fake } = await attachFake();

		fake.setSendRequestHandler(command => {
			if (command === "stackTrace") {
				return { stackFrames: [{ id: 7, name: "main", line: 10, column: 1 }], totalFrames: 1 };
			}
			if (command === "threads") return { threads: [{ id: 1, name: "main" }] };
			return {};
		});

		fake.emit("stopped", { reason: "breakpoint", threadId: 1 });

		const result = await manager.stackTrace(undefined, undefined);

		expect(result.stackFrames).toHaveLength(1);
		expect(result.warning).toBeUndefined();
	});

	it("does not warn when a non-stopped thread returns frames", async () => {
		const { manager, fake } = await attachFake();

		fake.setSendRequestHandler(command => {
			if (command === "stackTrace") {
				return { stackFrames: [{ id: 9, name: "worker", line: 5, column: 1 }], totalFrames: 1 };
			}
			if (command === "threads") return { threads: [{ id: 1, name: "main" }] };
			return {};
		});

		fake.emit("stopped", { reason: "breakpoint", threadId: 1 });

		const result = await manager.stackTrace(undefined, 20);

		expect(result.warning).toBeUndefined();
	});
});
