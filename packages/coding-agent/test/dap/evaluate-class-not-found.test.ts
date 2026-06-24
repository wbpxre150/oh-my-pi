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

describe("DapSessionManager evaluate class-resolution guidance (Bug 2)", () => {
	it("augments ClassNotFoundException with host-classpath guidance", async () => {
		const { manager, fake } = await attachFake();

		fake.setSendRequestHandler(command => {
			if (command === "evaluate") {
				throw new Error("java.lang.ClassNotFoundException: com.torrent.app.DaemonService");
			}
			return {};
		});

		fake.emit("stopped", { reason: "breakpoint", threadId: 1 });

		expect(manager.evaluate('Class.forName("com.torrent.app.DaemonService")', "repl")).rejects.toThrow(
			/host JVM.*ART|ART.*host JVM/s,
		);
		expect(manager.evaluate('Class.forName("com.torrent.app.DaemonService")', "repl")).rejects.toThrow(
			/ClassNotFound/,
		);
	});

	it("augments 'cannot find symbol' with host-classpath guidance", async () => {
		const { manager, fake } = await attachFake();

		fake.setSendRequestHandler(command => {
			if (command === "evaluate") {
				throw new Error("Compilation failed: cannot find symbol class DaemonService");
			}
			return {};
		});

		fake.emit("stopped", { reason: "step", threadId: 1 });

		expect(manager.evaluate("new DaemonService()", "repl")).rejects.toThrow(/host JVM/);
	});

	it("passes through non-class-resolution errors unchanged", async () => {
		const { manager, fake } = await attachFake();

		fake.setSendRequestHandler(command => {
			if (command === "evaluate") {
				throw new Error("Arithmetic exception: divide by zero");
			}
			return {};
		});

		fake.emit("stopped", { reason: "breakpoint", threadId: 1 });

		expect(manager.evaluate("1/0", "repl")).rejects.toThrow("Arithmetic exception: divide by zero");
	});
});
