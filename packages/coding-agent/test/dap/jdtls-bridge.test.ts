import { afterEach, describe, expect, it, spyOn, vi } from "bun:test";
import { resolveJdtlsDebugPort } from "../../src/dap/jdtls";
import * as lspClient from "../../src/lsp/client";
import * as lspConfig from "../../src/lsp/config";
import type { LspClient, ServerConfig } from "../../src/lsp/types";

const mockServerConfig: ServerConfig = {
	command: "jdtls",
	args: [],
	fileTypes: [".java"],
	rootMarkers: ["build.gradle"],
	resolvedCommand: "/usr/bin/jdtls",
};

function makeMockLspClient(): LspClient {
	return {
		name: "jdtls:/tmp",
		cwd: "/tmp",
		proc: { exitCode: null, kill() {}, exited: Promise.resolve(0), peekStderr: () => "" } as never,
		config: mockServerConfig,
		requestId: 0,
		diagnostics: new Map(),
		diagnosticsVersion: 0,
		openFiles: new Map(),
		pendingRequests: new Map(),
		messageBuffer: new Uint8Array(0),
		isReading: false,
		lastActivity: Date.now(),
		writeQueue: Promise.resolve(),
		activeProgressTokens: new Set(),
		projectLoaded: Promise.resolve(),
		resolveProjectLoaded: () => {},
	} as LspClient;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("resolveJdtlsDebugPort", () => {
	it("throws when jdtls is not in config.servers", async () => {
		spyOn(lspConfig, "loadConfig").mockReturnValue({
			servers: {},
			idleTimeoutMs: undefined,
		});
		await expect(resolveJdtlsDebugPort("/tmp")).rejects.toThrow("JDT-LS is not available");
	});

	it("returns host and port when startDebugSession succeeds", async () => {
		const mockClient = makeMockLspClient();
		spyOn(lspConfig, "loadConfig").mockReturnValue({
			servers: { jdtls: mockServerConfig },
			idleTimeoutMs: undefined,
		});
		spyOn(lspClient, "getOrCreateClient").mockResolvedValue(mockClient);
		spyOn(lspClient, "waitForProjectLoaded").mockResolvedValue();
		spyOn(lspClient, "sendRequest").mockResolvedValue(42423);

		const result = await resolveJdtlsDebugPort("/tmp");
		expect(result).toEqual({ host: "127.0.0.1", port: 42423 });
	});

	it("throws when startDebugSession returns a non-number", async () => {
		const mockClient = makeMockLspClient();
		spyOn(lspConfig, "loadConfig").mockReturnValue({
			servers: { jdtls: mockServerConfig },
			idleTimeoutMs: undefined,
		});
		spyOn(lspClient, "getOrCreateClient").mockResolvedValue(mockClient);
		spyOn(lspClient, "waitForProjectLoaded").mockResolvedValue();
		spyOn(lspClient, "sendRequest").mockResolvedValue(null);

		await expect(resolveJdtlsDebugPort("/tmp")).rejects.toThrow("invalid port");
	});
});
