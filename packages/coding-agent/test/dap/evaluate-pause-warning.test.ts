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

describe("DapSessionManager evaluate pause warning (Bug #3)", () => {
	it("appends pre-warn when evaluating while suspended via pause", async () => {
		const { manager, fake } = await attachFake();

		fake.setSendRequestHandler(command => {
			if (command === "evaluate") {
				return { result: '"hello"', variablesReference: 0 };
			}
			return {};
		});

		// Simulate pause-style stop
		fake.emit("stopped", { reason: "pause", threadId: 1 });

		const result = await manager.evaluate('"hello"', "repl");

		expect(result.evaluation.result).toBe('"hello"');
		expect(result.warning).toBeDefined();
		expect(result.warning).toContain("pause");
		expect(result.warning).toContain("step_in");
	});

	it("does not append pre-warn when suspended via breakpoint", async () => {
		const { manager, fake } = await attachFake();

		fake.setSendRequestHandler(command => {
			if (command === "evaluate") {
				return { result: "42", variablesReference: 0 };
			}
			return {};
		});

		fake.emit("stopped", { reason: "breakpoint", threadId: 1 });

		const result = await manager.evaluate("42", "repl");

		expect(result.evaluation.result).toBe("42");
		expect(result.warning).toBeUndefined();
	});

	it("does not append pre-warn when suspended via step", async () => {
		const { manager, fake } = await attachFake();

		fake.setSendRequestHandler(command => {
			if (command === "evaluate") {
				return { result: "42", variablesReference: 0 };
			}
			return {};
		});

		fake.emit("stopped", { reason: "step", threadId: 1 });

		const result = await manager.evaluate("42", "repl");

		expect(result.warning).toBeUndefined();
	});

	it("augments 'suspended by step or breakpoint' error with actionable guidance", async () => {
		const { manager, fake } = await attachFake();

		fake.setSendRequestHandler(command => {
			if (command === "evaluate") {
				throw new Error("Thread must be suspended by step or breakpoint to perform method invocation.");
			}
			return {};
		});

		fake.emit("stopped", { reason: "pause", threadId: 1 });

		expect(manager.evaluate("android.os.Process.myPid()", "repl")).rejects.toThrow(
			/Current suspension reason: "pause"/,
		);
	});

	it("passes through non-suspension evaluate errors unchanged", async () => {
		const { manager, fake } = await attachFake();

		fake.setSendRequestHandler(command => {
			if (command === "evaluate") {
				throw new Error("Compilation failed: unexpected token");
			}
			return {};
		});

		fake.emit("stopped", { reason: "step", threadId: 1 });

		expect(manager.evaluate("undefinedVar", "repl")).rejects.toThrow("Compilation failed: unexpected token");
	});
});
