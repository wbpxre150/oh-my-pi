import { afterEach, describe, expect, it, spyOn, vi } from "bun:test";
import { DapClient } from "../../src/dap/client";
import { DapSessionManager } from "../../src/dap/session";
import { TCP_TEST_ADAPTER, TcpFakeDapClient } from "./helpers/tcp-fake";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("DapSessionManager step_over native-frame fail-fast (Bug 4)", () => {
	it("throws fast and does not send 'next' when stopped in a native frame", async () => {
		const manager = new DapSessionManager();
		const fake = new TcpFakeDapClient(TCP_TEST_ADAPTER, process.cwd());
		spyOn(DapClient, "connectTcp").mockResolvedValue(fake as unknown as DapClient);

		let nextSent = false;
		fake.setSendRequestHandler(command => {
			if (command === "pause") {
				fake.emit("stopped", { reason: "pause", threadId: 1 });
				return {};
			}
			if (command === "stackTrace") {
				return {
					stackFrames: [{ id: 42, name: "MessageQueue.nativePollOnce", line: -1, column: 0 }],
					totalFrames: 1,
				};
			}
			if (command === "next") {
				nextSent = true;
				return {};
			}
			if (command === "threads") return { threads: [{ id: 1, name: "main" }] };
			return {};
		});

		await manager.attachTcp({
			adapter: TCP_TEST_ADAPTER,
			cwd: process.cwd(),
			host: "127.0.0.1",
			port: 12345,
		});

		await manager.pause();

		expect(manager.stepOver()).rejects.toThrow(/native method/);
		expect(nextSent).toBe(false);
	});

	it("step_in is not blocked on a native frame", async () => {
		const manager = new DapSessionManager();
		const fake = new TcpFakeDapClient(TCP_TEST_ADAPTER, process.cwd());
		spyOn(DapClient, "connectTcp").mockResolvedValue(fake as unknown as DapClient);

		let stepInSent = false;
		fake.setSendRequestHandler(command => {
			if (command === "pause") {
				fake.emit("stopped", { reason: "pause", threadId: 1 });
				return {};
			}
			if (command === "stackTrace") {
				return {
					stackFrames: [{ id: 42, name: "MessageQueue.nativePollOnce", line: -1, column: 0 }],
					totalFrames: 1,
				};
			}
			if (command === "stepIn") {
				stepInSent = true;
				return {};
			}
			if (command === "threads") return { threads: [{ id: 1, name: "main" }] };
			return {};
		});

		await manager.attachTcp({
			adapter: TCP_TEST_ADAPTER,
			cwd: process.cwd(),
			host: "127.0.0.1",
			port: 12345,
		});

		await manager.pause();

		const outcome = await manager.stepIn();
		expect(stepInSent).toBe(true);
		expect(outcome.timedOut).toBe(true);
	});

	it("step_over proceeds normally on a non-native frame with a source path", async () => {
		const manager = new DapSessionManager();
		const fake = new TcpFakeDapClient(TCP_TEST_ADAPTER, process.cwd());
		spyOn(DapClient, "connectTcp").mockResolvedValue(fake as unknown as DapClient);

		let nextSent = false;
		fake.setSendRequestHandler(command => {
			if (command === "pause") {
				fake.emit("stopped", { reason: "pause", threadId: 1 });
				return {};
			}
			if (command === "stackTrace") {
				return {
					stackFrames: [{ id: 42, name: "Foo.bar", line: 10, column: 1, source: { path: "/app/Foo.kt" } }],
					totalFrames: 1,
				};
			}
			if (command === "next") {
				nextSent = true;
				return {};
			}
			if (command === "threads") return { threads: [{ id: 1, name: "main" }] };
			return {};
		});

		await manager.attachTcp({
			adapter: TCP_TEST_ADAPTER,
			cwd: process.cwd(),
			host: "127.0.0.1",
			port: 12345,
		});

		await manager.pause();

		const outcome = await manager.stepOver();
		expect(nextSent).toBe(true);
		expect(outcome.timedOut).toBe(true);
	});
});
