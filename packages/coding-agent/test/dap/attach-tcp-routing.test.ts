import { afterEach, describe, expect, it, spyOn, vi } from "bun:test";
import { DapClient } from "../../src/dap/client";
import { DapSessionManager } from "../../src/dap/session";
import type { DapResolvedAdapter } from "../../src/dap/types";
import { TCP_TEST_ADAPTER, TcpFakeDapClient } from "./helpers/tcp-fake";

const STDIO_TEST_ADAPTER: DapResolvedAdapter = {
	name: "lldb-dap",
	command: "lldb-dap",
	args: [],
	resolvedCommand: "lldb-dap",
	languages: [],
	fileTypes: [],
	rootMarkers: [],
	launchDefaults: {},
	attachDefaults: {},
	connectMode: "stdio",
	acceptsDirectoryProgram: false,
};

afterEach(() => {
	vi.restoreAllMocks();
});

describe("DapSessionManager.attach TCP routing (Bug 2)", () => {
	it("routes a TCP adapter to connectTcp instead of spawn", async () => {
		const manager = new DapSessionManager();
		const fake = new TcpFakeDapClient(TCP_TEST_ADAPTER, process.cwd());
		const connectTcpSpy = spyOn(DapClient, "connectTcp").mockResolvedValue(fake as unknown as DapClient);
		const spawnSpy = spyOn(DapClient, "spawn").mockResolvedValue(fake as unknown as DapClient);

		const snapshot = await manager.attach({
			adapter: TCP_TEST_ADAPTER,
			cwd: process.cwd(),
			port: 12345,
			host: "127.0.0.1",
		});

		expect(connectTcpSpy).toHaveBeenCalledTimes(1);
		expect(spawnSpy).not.toHaveBeenCalled();
		expect(snapshot.adapter).toBe("jdtls");
	});

	it("still spawns for a stdio adapter", async () => {
		const manager = new DapSessionManager();
		const fake = new TcpFakeDapClient(STDIO_TEST_ADAPTER, process.cwd());
		const connectTcpSpy = spyOn(DapClient, "connectTcp").mockResolvedValue(fake as unknown as DapClient);
		const spawnSpy = spyOn(DapClient, "spawn").mockResolvedValue(fake as unknown as DapClient);

		await manager.attach({
			adapter: STDIO_TEST_ADAPTER,
			cwd: process.cwd(),
			pid: 123,
		});

		expect(spawnSpy).toHaveBeenCalledTimes(1);
		expect(connectTcpSpy).not.toHaveBeenCalled();
	});

	it("throws an actionable error when a TCP attach has no port", async () => {
		const manager = new DapSessionManager();
		spyOn(DapClient, "connectTcp").mockResolvedValue({} as unknown as DapClient);
		spyOn(DapClient, "spawn").mockResolvedValue({} as unknown as DapClient);

		await expect(manager.attach({ adapter: TCP_TEST_ADAPTER, cwd: process.cwd() })).rejects.toThrow(
			/requires a port/,
		);
	});
});
