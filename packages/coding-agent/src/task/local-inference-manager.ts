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

async function sshRestart(host: string, restartScript: string, slots: number): Promise<void> {
	const remoteCmd = `${restartScript} ${slots}`;
	logger.debug("local-inference: restarting remote server", { host, slots, remoteCmd });
	const proc = Bun.spawn(["ssh", host, remoteCmd], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		const stderr = await new Response(proc.stderr as ReadableStream).text();
		throw new Error(`SSH restart failed (exit ${exitCode}): ${stderr.trim()}`);
	}
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

// Serializes all ensureSlots calls so concurrent TaskTool invocations don't race.
let currentOperation: Promise<void> = Promise.resolve();

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
): Promise<void> {
	currentOperation = currentOperation.then(() => _ensureSlots(agentName, desiredSlots, config, providerBaseUrl));
	return currentOperation;
}

async function _ensureSlots(
	agentName: string,
	desiredSlots: number,
	config: LocalInferenceConfig,
	providerBaseUrl: string,
): Promise<void> {
	const state = await readState();
	const currentSlots = state?.currentSlots ?? null;

	if (!shouldRestart(agentName, desiredSlots, currentSlots)) {
		logger.debug("local-inference: no restart needed", { agentName, desiredSlots, currentSlots });
		return;
	}

	if (!config.ssh.host) throw new Error("local-inference: no SSH host configured in local-inference.yml");

	await sshRestart(config.ssh.host, config.ssh.restartScript, desiredSlots);

	const healthUrl = deriveHealthUrl(config, providerBaseUrl);
	await pollHealth(healthUrl, config.healthCheck.timeoutMs, config.healthCheck.pollIntervalMs);

	// When single-slot, write a marker file so the AI package can inject id_slot: 0.
	// When multi-slot, delete it so id_slot reverts to the default (-1).
	if (desiredSlots === 1) {
		await Bun.write(SLOT_MODE_FILE, JSON.stringify({ baseUrl: providerBaseUrl }));
	} else {
		await fs.rm(SLOT_MODE_FILE, { force: true });
	}

	await writeState({ currentSlots: desiredSlots, providerBaseUrl });
	logger.debug("local-inference: ready", { desiredSlots });
}
