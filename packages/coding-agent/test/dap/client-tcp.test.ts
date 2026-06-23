import { describe, expect, it } from "bun:test";
import { DapClient } from "../../src/dap/client";
import type { DapResolvedAdapter } from "../../src/dap/types";

const mockAdapter = (connectMode: "stdio" | "socket" | "tcp"): DapResolvedAdapter => ({
	name: "test-adapter",
	command: "echo",
	args: [],
	resolvedCommand: "/bin/echo",
	languages: [],
	fileTypes: [],
	rootMarkers: [],
	launchDefaults: {},
	attachDefaults: {},
	connectMode,
	acceptsDirectoryProgram: false,
});

describe("DapClient.connectTcp", () => {
	it("connects to a TCP server and parses DAP messages", async () => {
		let receivedData = "";

		const server = Bun.listen({
			hostname: "127.0.0.1",
			port: 0,
			socket: {
				open(_socket) {},
				data(socket, data) {
					receivedData += new TextDecoder().decode(data);
					const initReq = receivedData.match(/"command":"initialize"/);
					if (initReq && !receivedData.includes("response")) {
						const seqMatch = receivedData.match(/"seq":(\d+)/);
						const seq = seqMatch ? parseInt(seqMatch[1], 10) : 1;
						const responseBody = JSON.stringify({
							seq: 1,
							type: "response",
							request_seq: seq,
							success: true,
							command: "initialize",
							body: { supportsConfigurationDoneRequest: true },
						});
						socket.write(`Content-Length: ${Buffer.byteLength(responseBody)}\r\n\r\n${responseBody}`);
					}
				},
				close() {},
				error() {},
			},
		});

		const port = server.port;
		const client = await DapClient.connectTcp(mockAdapter("tcp"), "/tmp", "127.0.0.1", port);

		expect(client.proc).toBeNull();
		expect(client.isAlive()).toBe(true);

		const capabilities = await client.initialize({
			clientID: "test",
			adapterID: "test-adapter",
			linesStartAt1: true,
			columnsStartAt1: true,
			pathFormat: "path",
		});

		expect(capabilities.supportsConfigurationDoneRequest).toBe(true);

		await client.dispose();
		expect(client.isAlive()).toBe(false);
		server.stop();
	});
});

describe("DapClient.spawn rejects tcp connectMode", () => {
	it("throws an actionable error", async () => {
		await expect(DapClient.spawn({ adapter: mockAdapter("tcp"), cwd: "/tmp" })).rejects.toThrow("connectTcp");
	});
});
