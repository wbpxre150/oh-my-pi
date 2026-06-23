import { logger } from "@oh-my-pi/pi-utils";
import { getOrCreateClient, sendRequest, waitForProjectLoaded } from "../lsp/client";
import { loadConfig } from "../lsp/config";
import type { ServerConfig } from "../lsp/types";

/**
 * Resolve the DAP TCP port for a JDT-LS debug session.
 *
 * Gets or creates the JDT-LS LSP client for the given cwd, waits for the
 * project to be imported, then sends `vscode.java.startDebugSession` via
 * `workspace/executeCommand`. The java-debug plugin (loaded via osgi.bundles
 * in config.ini) starts a DAP TCP server and returns the port.
 *
 * The JDT-LS LSP client is NOT disposed with the debug session - it is
 * shared and managed by the LSP infrastructure's idle timeout.
 *
 * @returns `{ host: "127.0.0.1", port: <number> }` - the DAP TCP endpoint.
 * @throws if JDT-LS is not available, project import fails, or the
 *         startDebugSession command fails.
 */
export async function resolveJdtlsDebugPort(
	cwd: string,
	signal?: AbortSignal,
): Promise<{ host: string; port: number }> {
	const config = loadConfig(cwd);
	const jdtlsConfig: ServerConfig | undefined = config.servers.jdtls;
	if (!jdtlsConfig) {
		throw new Error(
			"JDT-LS is not available. Install JDT-LS and ensure it is on PATH, or configure it in lsp.json. " +
				"JDT-LS is required for Android (Java/Kotlin) debugging.",
		);
	}

	const client = await getOrCreateClient(jdtlsConfig, cwd, jdtlsConfig.warmupTimeoutMs);
	await waitForProjectLoaded(client, signal);

	const port = await sendRequest(
		client,
		"workspace/executeCommand",
		{
			command: "vscode.java.startDebugSession",
			arguments: [],
		},
		signal,
		30_000,
	);

	if (typeof port !== "number" || port <= 0) {
		throw new Error(
			`vscode.java.startDebugSession returned an invalid port: ${JSON.stringify(port)}. ` +
				"Ensure the java-debug plugin is installed and registered in JDT-LS config.ini.",
		);
	}

	logger.info("JDT-LS debug session started", { port });
	return { host: "127.0.0.1", port };
}
