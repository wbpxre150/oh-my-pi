import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "bun:test";
import * as fs from "node:fs/promises";
import { hookFetch } from "@oh-my-pi/pi-utils";
import type { Subprocess } from "bun";
import type { LocalInferenceConfig, ModelTier } from "../../src/config/local-inference-config";

// ── helpers ──────────────────────────────────────────────────────────────

function createTextStream(text: string): ReadableStream<Uint8Array> {
	const body = new Response(text).body;
	if (!body) throw new Error("Failed to create response stream.");
	return body;
}

function createFakeProcess(stdout = "", stderr = "", exitCode = 0): Subprocess {
	return {
		pid: 99999,
		stdout: createTextStream(stdout),
		stderr: createTextStream(stderr),
		exited: Promise.resolve(exitCode),
	} as Subprocess;
}

// ── fixtures ─────────────────────────────────────────────────────────────

function makeConfig(overrides?: Partial<LocalInferenceConfig>): LocalInferenceConfig {
	return {
		ssh: { host: "test-host", restartScript: "~/ai.sh" },
		healthCheck: { timeoutMs: 500, pollIntervalMs: 10 },
		agentConcurrency: { explore: 2, task: 1 },
		...overrides,
	} as LocalInferenceConfig;
}

const BASE_URL = "http://test-server:8080";

// ── shared mock state ───────────────────────────────────────────────────

let mockState: Record<string, unknown> | null = null;
const spawnBehaviors: Record<string, { stdout: string; stderr: string; exitCode: number }> = {};

function setSpawnBehavior(cmdKey: string, behavior: { stdout?: string; stderr?: string; exitCode?: number }) {
	spawnBehaviors[cmdKey] = { stdout: "", stderr: "", exitCode: 0, ...behavior };
}

function setStateFile(state: Record<string, unknown> | null) {
	mockState = state;
}

// Shared call tracking for spawned processes
interface SpawnCall {
	cmd: string[];
}
const spawnCalls: SpawnCall[] = [];
const writeCalls: { path: string; data: string }[] = [];
const rmCalls: string[] = [];

// ── mock wiring ──────────────────────────────────────────────────────────

function resetTrackers() {
	spawnCalls.length = 0;
	writeCalls.length = 0;
	rmCalls.length = 0;
}

function resetBehaviors() {
	for (const key of Object.keys(spawnBehaviors)) {
		delete spawnBehaviors[key];
	}
	spawnBehaviors["kill -0"] = { stdout: "", stderr: "", exitCode: 0 };
	spawnBehaviors.kill = { stdout: "", stderr: "", exitCode: 0 };
	spawnBehaviors["ai.sh"] = { stdout: "12345", stderr: "", exitCode: 0 };
}

function wireMocks() {
	vi.spyOn(Bun, "spawn").mockImplementation(((cmd: string[]): Subprocess => {
		const cmdStr = cmd.join(" ");
		spawnCalls.push({ cmd });

		for (const key of Object.keys(spawnBehaviors)) {
			if (cmdStr.includes(key)) {
				const b = spawnBehaviors[key]!;
				return createFakeProcess(b.stdout, b.stderr, b.exitCode);
			}
		}

		return createFakeProcess();
	}) as unknown as typeof Bun.spawn);

	vi.spyOn(Bun, "file").mockImplementation(((_path: string | URL) => {
		return {
			json: async () => {
				if (mockState === null) throw new Error("ENOENT: no such file");
				return mockState;
			},
			exists: async () => mockState !== null,
		} as unknown as ReturnType<typeof Bun.file>;
	}) as unknown as typeof Bun.file);

	vi.spyOn(Bun, "write").mockImplementation(((path: string | URL, data: string) => {
		writeCalls.push({ path: String(path), data });
		return Promise.resolve(0);
	}) as unknown as typeof Bun.write);

	vi.spyOn(fs, "rm").mockImplementation(((path: string) => {
		rmCalls.push(String(path));
		return Promise.resolve(undefined);
	}) as unknown as typeof fs.rm);
}

// ── module-chain helpers ─────────────────────────────────────────────────
//
// The module's `currentOperation` serialization chain (module-level promise)
// persists across tests. If any test leaves the chain rejected, subsequent
// tests that chain `.then()` onto it silently skip the callback and inherit
// the old rejection.
//
// Strategy: import the module once per describe group that needs it, and
// re-import with a cache-busting URL param for the next independent group.
// Bun caches ESM by resolved path, so we use a distinct query param per
// group to force a fresh module instance.

async function importModule(version: string) {
	// Bun deduplicates imports by resolved path. A non-existent file-param
	// doesn't change resolution, but a unique URL fragment + force param
	// persuades Bun's module cache to emit a new instance. We load it with
	// a synthetic suffix that the TS file resolver normalises away, giving
	// us back the same file as a separate module record.
	return (await import(`../../src/task/local-inference-manager.ts?v=${version}`)) as {
		ensureLocalInferenceSlots: (
			agentName: string,
			desiredSlots: number,
			desiredTier: ModelTier,
			config: LocalInferenceConfig,
			providerBaseUrl: string,
		) => Promise<number>;
	};
}

// ── setup / teardown per test group ─────────────────────────────────────
// Each `describe` block calls importModule with its own version string so
// tests within that block share a module instance (and thus the same
// currentOperation chain). The block's own `afterEach` resets mocks but
// keeps the module instance alive.

function setupSuite() {
	beforeEach(() => {
		resetTrackers();
		resetBehaviors();
		mockState = null;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});
}

// ═══════════════════════════════════════════════════════════════════════
// SUITE A: Positive tests (first run / matching slots / slot-mode files)
// ═══════════════════════════════════════════════════════════════════════

describe("local-inference-manager (restart path)", () => {
	setupSuite();

	let ensure: (
		agentName: string,
		desiredSlots: number,
		desiredTier: ModelTier,
		config: LocalInferenceConfig,
		providerBaseUrl: string,
	) => Promise<number>;

	beforeAll(async () => {
		const mod = await importModule("restart");
		ensure = mod.ensureLocalInferenceSlots;
	});

	it("first run (no state) starts server, writes state with pid, returns desiredSlots", async () => {
		wireMocks();
		using _hook = hookFetch(() => new Response(null, { status: 200 }));
		setStateFile(null);
		const result = await ensure("task", 2, "s", makeConfig(), BASE_URL);

		expect(result).toBe(2);

		const startCalls = spawnCalls.filter(c => c.cmd.join(" ").includes("ai.sh"));
		expect(startCalls.length).toBeGreaterThanOrEqual(1);

		const killCalls = spawnCalls.filter(c => {
			const joined = c.cmd.join(" ");
			return joined.includes("kill") && !joined.includes("-0");
		});
		expect(killCalls.length).toBe(0);

		const stateWrite = writeCalls.find(c => c.data.includes("currentSlots"));
		expect(stateWrite).toBeDefined();
		const written = JSON.parse(stateWrite!.data);
		expect(written.currentSlots).toBe(2);
		expect(written.providerBaseUrl).toBe(BASE_URL);
		expect(typeof written.pid).toBe("number");
		expect(written.pid).toBeGreaterThan(0);

		expect(rmCalls.length).toBeGreaterThanOrEqual(1);
	});

	it("matching slots with alive pid returns currentSlots without restart", async () => {
		wireMocks();
		using _hook = hookFetch(() => new Response(null, { status: 200 }));
		setStateFile({ currentSlots: 2, providerBaseUrl: BASE_URL, pid: 42, tier: "s" });

		const result = await ensure("task", 2, "s", makeConfig(), BASE_URL);

		expect(result).toBe(2);
		expect(spawnCalls.length).toBe(1);
		expect(spawnCalls[0]!.cmd.join(" ")).toContain("kill -0");
	});

	it("matching slots with dead pid sigterms then restarts", async () => {
		wireMocks();
		using _hook = hookFetch(() => new Response(null, { status: 200 }));
		setStateFile({ currentSlots: 2, providerBaseUrl: BASE_URL, pid: 42, tier: "s" });
		setSpawnBehavior("kill -0", { exitCode: 1 });

		const result = await ensure("task", 2, "s", makeConfig(), BASE_URL);

		expect(result).toBe(2);

		const killCalls = spawnCalls.filter(c => {
			const joined = c.cmd.join(" ");
			return joined.includes("kill") && !joined.includes("-0");
		});
		expect(killCalls.length).toBe(1);

		const startCalls = spawnCalls.filter(c => c.cmd.join(" ").includes("ai.sh"));
		expect(startCalls.length).toBe(1);
	});

	it("passes model tier as second arg to restart script and persists it", async () => {
		wireMocks();
		using _hook = hookFetch(() => new Response(null, { status: 200 }));
		setStateFile(null);
		setSpawnBehavior("ai.sh", { stdout: "12345", exitCode: 0 });

		await ensure("explore", 2, "f", makeConfig(), BASE_URL);

		const startCall = spawnCalls.find(c => c.cmd.join(" ").includes("ai.sh"));
		expect(startCall).toBeDefined();
		const cmdString = startCall!.cmd.join(" ");
		// remoteCmd is "~/ai.sh 2 f"; ssh args are ["ssh", host, "~/ai.sh 2 f"]
		expect(cmdString).toMatch(/ai\.sh 2 f/);

		const stateWrite = writeCalls.find(c => c.data.includes("currentSlots"));
		expect(stateWrite).toBeDefined();
		const written = JSON.parse(stateWrite!.data);
		expect(written.tier).toBe("f");
	});

	it("tier mismatch forces restart even when slot count matches", async () => {
		wireMocks();
		using _hook = hookFetch(() => new Response(null, { status: 200 }));
		// Server running tier "f", 2 slots, alive pid — but we want "s".
		setStateFile({ currentSlots: 2, providerBaseUrl: BASE_URL, pid: 42, tier: "f" });

		await ensure("task", 2, "s", makeConfig(), BASE_URL);

		const startCalls = spawnCalls.filter(c => c.cmd.join(" ").includes("ai.sh"));
		expect(startCalls.length).toBeGreaterThanOrEqual(1);
		const killCalls = spawnCalls.filter(c => {
			const joined = c.cmd.join(" ");
			return joined.includes("kill") && !joined.includes("-0");
		});
		expect(killCalls.length).toBeGreaterThanOrEqual(1);
	});
});

// ═══════════════════════════════════════════════════════════════════════
// SUITE B: Slot-mode file persistence
// ═══════════════════════════════════════════════════════════════════════

describe("local-inference-manager (slot-mode)", () => {
	setupSuite();

	let ensure: (
		agentName: string,
		desiredSlots: number,
		desiredTier: ModelTier,
		config: LocalInferenceConfig,
		providerBaseUrl: string,
	) => Promise<number>;

	beforeAll(async () => {
		const mod = await importModule("slot-mode");
		ensure = mod.ensureLocalInferenceSlots;
	});

	it("single-slot writes slot-mode file (baseUrl only), multi-slot deletes it", async () => {
		wireMocks();
		using _hook = hookFetch(() => new Response(null, { status: 200 }));
		setStateFile(null);
		setSpawnBehavior("ai.sh", { stdout: "12345", exitCode: 0 });

		await ensure("task", 1, "s", makeConfig(), BASE_URL);

		const slotModeWrite = writeCalls.find(c => c.data.includes("baseUrl"));
		expect(slotModeWrite).toBeDefined();
		expect(slotModeWrite!.data).not.toContain("pid");
		const written = JSON.parse(slotModeWrite!.data);
		expect(written).toEqual({ baseUrl: BASE_URL });

		// Reset for multi-slot half
		resetTrackers();
		mockState = null;
		setSpawnBehavior("ai.sh", { stdout: "12345", exitCode: 0 });

		await ensure("task", 2, "s", makeConfig(), BASE_URL);

		expect(rmCalls.length).toBeGreaterThanOrEqual(1);
	});
});

// ═══════════════════════════════════════════════════════════════════════
// SUITE C: Error cases (each gets its own module instance)
// ═══════════════════════════════════════════════════════════════════════

describe('local-inference-manager (sshStartServer stdout "0")', () => {
	setupSuite();

	let ensure: (
		agentName: string,
		desiredSlots: number,
		desiredTier: ModelTier,
		config: LocalInferenceConfig,
		providerBaseUrl: string,
	) => Promise<number>;

	beforeAll(async () => {
		const mod = await importModule("err-zero");
		ensure = mod.ensureLocalInferenceSlots;
	});

	it("throws model-unavailable error", async () => {
		wireMocks();
		using _hook = hookFetch(() => new Response(null, { status: 200 }));
		setStateFile(null);
		setSpawnBehavior("ai.sh", { stdout: "0", exitCode: 0 });

		await expect(ensure("task", 2, "s", makeConfig(), BASE_URL)).rejects.toThrow(
			"model is unavailable: server did not stop within 5 s after SIGTERM",
		);
	});
});

describe('local-inference-manager (sshStartServer stdout "garbage")', () => {
	setupSuite();

	let ensure: (
		agentName: string,
		desiredSlots: number,
		desiredTier: ModelTier,
		config: LocalInferenceConfig,
		providerBaseUrl: string,
	) => Promise<number>;

	beforeAll(async () => {
		const mod = await importModule("err-garbage");
		ensure = mod.ensureLocalInferenceSlots;
	});

	it("throws unparseable-PID error", async () => {
		wireMocks();
		using _hook = hookFetch(() => new Response(null, { status: 200 }));
		setStateFile(null);
		setSpawnBehavior("ai.sh", { stdout: "garbage", exitCode: 0 });

		await expect(ensure("task", 2, "s", makeConfig(), BASE_URL)).rejects.toThrow("unparseable server PID");
	});
});
