import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "bun:test";
import type { Model } from "@oh-my-pi/pi-ai/types";
import { ModelRegistry } from "../../src/config/model-registry";
import * as modelResolver from "../../src/config/model-resolver";
import type { CreateAgentSessionResult } from "../../src/sdk";
import * as sdk from "../../src/sdk";
import { AuthStorage } from "../../src/session/auth-storage";
import { runSubprocess } from "../../src/task/executor";
import type { AgentDefinition } from "../../src/task/types";

/**
 * Contract: when `activeSlots > 1`, `runSubprocess` divides the model's
 * `contextWindow` by `activeSlots` before passing to `createAgentSession`.
 * Single-slot and undefined cases pass the model unchanged.
 */

const FAKE_MODEL: Model = {
	id: "test-model",
	provider: "test-provider",
	contextWindow: 200_000,
} as Model;

const MINIMAL_AGENT: AgentDefinition = {
	name: "test-agent",
	description: "test",
	systemPrompt: "you are helpful",
	source: "bundled",
} as AgentDefinition;

let modelRegistry: ModelRegistry;

beforeAll(async () => {
	const authDir = await import("node:fs/promises").then(fs => fs.mkdtemp("/tmp/auth-"));
	const authStorage = await AuthStorage.create(`${authDir}/auth.db`);
	modelRegistry = new ModelRegistry(authStorage);
});

describe("local-inference context-window division", () => {
	let capturedModel: Model | undefined;

	beforeEach(() => {
		capturedModel = undefined;
		vi.spyOn(modelResolver, "resolveModelOverrideWithAuthFallback").mockResolvedValue({
			model: FAKE_MODEL,
			authFallbackUsed: false,
			explicitThinkingLevel: false,
		});
		vi.spyOn(sdk, "createAgentSession").mockImplementation(async options => {
			capturedModel = options?.model;
			return { session: undefined as never } as unknown as CreateAgentSessionResult;
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("activeSlots=2 halves the context window", async () => {
		await runSubprocess({
			cwd: "/tmp",
			agent: MINIMAL_AGENT,
			task: "test task",
			index: 0,
			id: "test-0",
			modelOverride: "test-model",
			activeSlots: 2,
			signal: AbortSignal.timeout(10_000),
			modelRegistry,
		});

		expect(capturedModel).toBeDefined();
		expect(capturedModel!.contextWindow).toBe(100_000);
	});

	it("activeSlots=1 leaves context window unchanged", async () => {
		await runSubprocess({
			cwd: "/tmp",
			agent: MINIMAL_AGENT,
			task: "test task",
			index: 0,
			id: "test-1",
			modelOverride: "test-model",
			activeSlots: 1,
			signal: AbortSignal.timeout(10_000),
			modelRegistry,
		});

		expect(capturedModel).toBeDefined();
		expect(capturedModel!.contextWindow).toBe(200_000);
	});

	it("activeSlots=undefined leaves context window unchanged", async () => {
		await runSubprocess({
			cwd: "/tmp",
			agent: MINIMAL_AGENT,
			task: "test task",
			index: 0,
			id: "test-2",
			modelOverride: "test-model",
			signal: AbortSignal.timeout(10_000),
			modelRegistry,
		});

		expect(capturedModel).toBeDefined();
		expect(capturedModel!.contextWindow).toBe(200_000);
	});

	it("activeSlots=3 uses Math.floor division", async () => {
		await runSubprocess({
			cwd: "/tmp",
			agent: MINIMAL_AGENT,
			task: "test task",
			index: 0,
			id: "test-3",
			modelOverride: "test-model",
			activeSlots: 3,
			signal: AbortSignal.timeout(10_000),
			modelRegistry,
		});

		expect(capturedModel).toBeDefined();
		expect(capturedModel!.contextWindow).toBe(66_666);
	});
});
