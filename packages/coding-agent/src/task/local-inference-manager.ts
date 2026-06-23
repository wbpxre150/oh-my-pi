/**
 * Manages the slot count of a remote llama.cpp server for local inference.
 *
 * When `localInferenceControl: true` is set on a provider in models.yml and
 * ~/.omp/agent/local-inference.yml is present, this module SSHs into the
 * remote host and restarts the server with the correct number of parallel
 * slots before subagents run.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getAgentDir, logger } from "@oh-my-pi/pi-utils";
import type { LocalInferenceConfig } from "../config/local-inference-config";

const STATE_FILE = path.join(getAgentDir(), ".local-inference-state.json");
const SLOT_MODE_FILE = path.join(getAgentDir(), ".local-inference-slot-mode");

interface LocalInferenceState {
	currentSlots: number;
	providerBaseUrl: string;
	pid?: number;
}

async function readState(): Promise<LocalInferenceState | null> {
	try {
		return await Bun.file(STATE_FILE).json();
	} catch {
		return null;
	}
}

async function writeState(state: LocalInferenceState): Promise<void> {
	await Bun.write(STATE_FILE, JSON.stringify(state));
}

/** Send SIGTERM to the remote server process. Exit code ignored (process may already be gone). */
async function sshSigterm(host: string, pid: number): Promise<void> {
	logger.debug("local-inference: sending SIGTERM to remote server", { host, pid });
	const proc = Bun.spawn(["ssh", host, `kill ${pid}`], {
		stdout: "pipe",
		stderr: "pipe",
	});
	await proc.exited; // ignore exit code
}

/** Check if the remote server process is alive. Returns true if `kill -0` succeeds. */
async function sshIsAlive(host: string, pid: number): Promise<boolean> {
	const proc = Bun.spawn(["ssh", host, `kill -0 ${pid}`], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const exitCode = await proc.exited;
	return exitCode === 0;
}

/**
 * Start the remote server with the given slot count. The remote script prints
 * the new server PID to stdout. Returns the parsed PID.
 * - stdout parses to 0: the old server did not stop within the 5 s SIGTERM grace
 *   window; throw "model is unavailable: server did not stop within 5 s after SIGTERM".
 * - stdout parses to a non-zero integer: that is the new PID; return it.
 * - stdout unparseable: throw a descriptive error.
 */
async function sshStartServer(host: string, restartScript: string, slots: number): Promise<number> {
	const remoteCmd = `${restartScript} ${slots}`;
	logger.debug("local-inference: starting remote server", { host, slots, remoteCmd });
	const proc = Bun.spawn(["ssh", host, remoteCmd], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const exitCode = await proc.exited;
	const stdout = (await new Response(proc.stdout as ReadableStream).text()).trim();
	if (exitCode !== 0) {
		const stderr = await new Response(proc.stderr as ReadableStream).text();
		throw new Error(`SSH start failed (exit ${exitCode}): ${stderr.trim()}`);
	}
	const pid = Number.parseInt(stdout, 10);
	if (!Number.isFinite(pid)) {
		throw new Error(`local-inference: unparseable server PID from remote script (stdout: ${JSON.stringify(stdout)})`);
	}
	if (pid === 0) {
		throw new Error("model is unavailable: server did not stop within 5 s after SIGTERM");
	}
	return pid;
}

async function pollHealth(url: string, timeoutMs: number, pollIntervalMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(url, { signal: AbortSignal.timeout(3_000) });
			if (res.ok) {
				logger.debug("local-inference: server healthy", { url });
				return;
			}
		} catch {
			// not up yet
		}
		await Bun.sleep(pollIntervalMs);
	}
	throw new Error(`Local inference server did not become healthy within ${timeoutMs}ms (url: ${url})`);
}

function shouldRestart(agentName: string, desired: number, current: number | null): boolean {
	if (current === null) return true; // unknown state — always restart
	if (desired === current) return false;
	if (agentName === "explore") return desired > current; // only upscale for explore
	return true; // task and others always get exact slot count
}

function deriveHealthUrl(config: LocalInferenceConfig, providerBaseUrl: string): string {
	if (config.healthCheckUrl) return config.healthCheckUrl;
	const base = providerBaseUrl.replace(/\/$/, "");
	return `${base}/health`;
}

/**
 * Erase the KV cache / checkpoints of one server slot. Best-effort: never throws.
 * Returns true on success (2xx), false on failure (non-2xx or network error).
 *
 * @param providerBaseUrl - baseUrl of the controlled provider (same server that serves
 *   /v1/chat/completions). The /slots endpoint is part of the same llama.cpp server.
 * @param slotId - slot index to erase (0..N-1).
 */
export async function eraseSlot(providerBaseUrl: string, slotId: number): Promise<boolean> {
	const base = new URL(providerBaseUrl);
	const url = `${base.origin}/slots/${slotId}?action=erase`;
	try {
		const res = await fetch(url, { method: "POST", signal: AbortSignal.timeout(10_000) });
		if (!res.ok) {
			logger.warn("local-inference: slot erase failed", { url, status: res.status });
			return false;
		}
		logger.debug("local-inference: slot erased", { slotId });
		return true;
	} catch (err) {
		logger.warn("local-inference: slot erase error", {
			url,
			error: err instanceof Error ? err.message : String(err),
		});
		return false;
	}
}

// Serializes all ensureSlots calls so concurrent TaskTool invocations don't race.
let currentOperation: Promise<number> = Promise.resolve(0);

/**
 * Ensures the remote llama.cpp server is running with `desiredSlots` parallel
 * slots. Serialized — only one restart runs at a time.
 *
 * @param agentName - "explore" | "task" | other agent name
 * @param desiredSlots - number of parallel slots needed
 * @param config - parsed local-inference.yml
 * @param providerBaseUrl - baseUrl from models.yml for the controlled provider
 */
export function ensureLocalInferenceSlots(
	agentName: string,
	desiredSlots: number,
	config: LocalInferenceConfig,
	providerBaseUrl: string,
): Promise<number> {
	currentOperation = currentOperation.then(() => _ensureSlots(agentName, desiredSlots, config, providerBaseUrl));
	return currentOperation;
}

async function _ensureSlots(
	agentName: string,
	desiredSlots: number,
	config: LocalInferenceConfig,
	providerBaseUrl: string,
): Promise<number> {
	const state = await readState();
	const currentSlots = state?.currentSlots ?? null;
	const savedPid = state?.pid ?? null;

	let needsRestart = shouldRestart(agentName, desiredSlots, currentSlots);

	// Even when the slot count matches, the server may have crashed between
	// calls. If we have a saved pid, liveness-check it; a dead server forces a
	// transparent re-restart.
	if (!needsRestart && savedPid !== null) {
		if (!config.ssh.host) throw new Error("local-inference: no SSH host configured in local-inference.yml");
		const alive = await sshIsAlive(config.ssh.host, savedPid);
		if (!alive) {
			logger.debug("local-inference: server dead despite matching slot count; re-restarting", {
				agentName,
				currentSlots,
			});
			needsRestart = true;
		}
	}

	if (!needsRestart) {
		logger.debug("local-inference: no restart needed", { agentName, desiredSlots, currentSlots });
		return currentSlots!;
	}

	if (!config.ssh.host) throw new Error("local-inference: no SSH host configured in local-inference.yml");

	// If a saved pid exists, SIGTERM the old server before starting a new one.
	if (savedPid !== null) {
		await sshSigterm(config.ssh.host, savedPid);
	}

	const newPid = await sshStartServer(config.ssh.host, config.ssh.restartScript, desiredSlots);

	const healthUrl = deriveHealthUrl(config, providerBaseUrl);
	await pollHealth(healthUrl, config.healthCheck.timeoutMs, config.healthCheck.pollIntervalMs);

	// Slot-mode marker: single-slot writes the file (id_slot: 0 injection);
	// multi-slot deletes it (id_slot defaults to -1). Unchanged from before.
	if (desiredSlots === 1) {
		await Bun.write(SLOT_MODE_FILE, JSON.stringify({ baseUrl: providerBaseUrl }));
	} else {
		await fs.rm(SLOT_MODE_FILE, { force: true });
	}

	await writeState({ currentSlots: desiredSlots, providerBaseUrl, pid: newPid });
	logger.debug("local-inference: ready", { desiredSlots, newPid });
	return desiredSlots;
}
