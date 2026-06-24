import { afterEach, describe, expect, it, spyOn, vi } from "bun:test";
import { DapClient } from "../../src/dap/client";
import { DapSessionManager } from "../../src/dap/session";
import { TCP_TEST_ADAPTER, TcpFakeDapClient } from "./helpers/tcp-fake";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("DapSessionManager customRequest arguments forwarding (Bug 6)", () => {
	it("forwards the arguments object as the DAP request body", async () => {
		const manager = new DapSessionManager();
		const fake = new TcpFakeDapClient(TCP_TEST_ADAPTER, process.cwd());
		spyOn(DapClient, "connectTcp").mockResolvedValue(fake as unknown as DapClient);

		let capturedCommand: string | undefined;
		let capturedArgs: unknown;
		fake.setSendRequestHandler((command, args) => {
			// configurationDone is sent during the attach handshake; ignore it.
			if (command === "configurationDone") return {};
			capturedCommand = command;
			capturedArgs = args;
			return { ok: true, echo: args };
		});

		await manager.attachTcp({
			adapter: TCP_TEST_ADAPTER,
			cwd: process.cwd(),
			host: "127.0.0.1",
			port: 12345,
		});

		const args = { expression: "1 + 1", context: "repl", frameId: 3 };
		const result = await manager.customRequest("evaluate", args);

		expect(capturedCommand).toBe("evaluate");
		expect(capturedArgs).toEqual(args);
		expect(result.body).toEqual({ ok: true, echo: args });
	});

	it("forwards undefined arguments when none are supplied", async () => {
		const manager = new DapSessionManager();
		const fake = new TcpFakeDapClient(TCP_TEST_ADAPTER, process.cwd());
		spyOn(DapClient, "connectTcp").mockResolvedValue(fake as unknown as DapClient);

		let capturedArgs: unknown = "unset";
		fake.setSendRequestHandler((command, args) => {
			if (command === "configurationDone") return {};
			capturedArgs = args;
			return {};
		});

		await manager.attachTcp({
			adapter: TCP_TEST_ADAPTER,
			cwd: process.cwd(),
			host: "127.0.0.1",
			port: 12345,
		});

		await manager.customRequest("loadedSources");

		expect(capturedArgs).toBeUndefined();
	});
});
