import { afterEach, describe, expect, it, spyOn, vi } from "bun:test";
import { DapClient } from "../../src/dap/client";
import { DapSessionManager } from "../../src/dap/session";
import { TCP_TEST_ADAPTER, TcpFakeDapClient } from "./helpers/tcp-fake";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("DapSessionManager pause (Bug 2)", () => {
	it("populates frameId after pause by fetching the top frame", async () => {
		const manager = new DapSessionManager();
		const fake = new TcpFakeDapClient(TCP_TEST_ADAPTER, process.cwd());
		spyOn(DapClient, "connectTcp").mockResolvedValue(fake as unknown as DapClient);

		fake.setSendRequestHandler(command => {
			if (command === "pause") {
				// Emit stopped synchronously so #handleStoppedEvent fires
				// before pause() checks session.status.
				fake.emit("stopped", { reason: "pause", threadId: 1 });
				return {};
			}
			if (command === "stackTrace") {
				return { stackFrames: [{ id: 42, name: "main", line: 10, column: 1 }], totalFrames: 1 };
			}
			if (command === "threads") {
				return { threads: [{ id: 1, name: "main" }] };
			}
			return {};
		});

		await manager.attachTcp({
			adapter: TCP_TEST_ADAPTER,
			cwd: process.cwd(),
			host: "127.0.0.1",
			port: 12345,
		});

		const snapshot = await manager.pause();

		expect(snapshot.status).toBe("stopped");
		expect(snapshot.frameId).toBe(42);
	});
});

describe("DapSessionManager continued event handler (Bug 2)", () => {
	it("does not clobber stop state when a different thread continues", async () => {
		const manager = new DapSessionManager();
		const fake = new TcpFakeDapClient(TCP_TEST_ADAPTER, process.cwd());
		spyOn(DapClient, "connectTcp").mockResolvedValue(fake as unknown as DapClient);

		await manager.attachTcp({
			adapter: TCP_TEST_ADAPTER,
			cwd: process.cwd(),
			host: "127.0.0.1",
			port: 12345,
		});

		fake.emit("stopped", { reason: "breakpoint", threadId: 1 });
		fake.emit("continued", { threadId: 2, allThreadsContinued: false });

		const snapshot = manager.getActiveSession();
		expect(snapshot?.status).toBe("stopped");
		expect(snapshot?.threadId).toBe(1);
	});

	it("clears stop state when the stopped thread continues", async () => {
		const manager = new DapSessionManager();
		const fake = new TcpFakeDapClient(TCP_TEST_ADAPTER, process.cwd());
		spyOn(DapClient, "connectTcp").mockResolvedValue(fake as unknown as DapClient);

		await manager.attachTcp({
			adapter: TCP_TEST_ADAPTER,
			cwd: process.cwd(),
			host: "127.0.0.1",
			port: 12345,
		});

		fake.emit("stopped", { reason: "breakpoint", threadId: 1 });
		fake.emit("continued", { threadId: 1, allThreadsContinued: false });

		const snapshot = manager.getActiveSession();
		expect(snapshot?.status).toBe("running");
	});

	it("clears stop state when allThreadsContinued is true", async () => {
		const manager = new DapSessionManager();
		const fake = new TcpFakeDapClient(TCP_TEST_ADAPTER, process.cwd());
		spyOn(DapClient, "connectTcp").mockResolvedValue(fake as unknown as DapClient);

		await manager.attachTcp({
			adapter: TCP_TEST_ADAPTER,
			cwd: process.cwd(),
			host: "127.0.0.1",
			port: 12345,
		});

		fake.emit("stopped", { reason: "breakpoint", threadId: 1 });
		fake.emit("continued", { threadId: 2, allThreadsContinued: true });

		const snapshot = manager.getActiveSession();
		expect(snapshot?.status).toBe("running");
	});
});
