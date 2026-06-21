import { afterEach, describe, expect, it, vi } from "bun:test";
import { LocalInferenceConfigFile } from "../../src/config/local-inference-config";
import { Settings } from "../../src/config/settings";
import * as planHandoff from "../../src/plan-mode/plan-handoff";
import { TaskTool } from "../../src/task";
import * as discoveryModule from "../../src/task/discovery";
import * as executorModule from "../../src/task/executor";
import * as localInferenceManager from "../../src/task/local-inference-manager";
import type { AgentDefinition, SingleResult, TaskParams } from "../../src/task/types";
import type { ToolSession } from "../../src/tools";

/**
 * Contract: when local inference control is active, each concurrent subagent is pinned
 * to a distinct slot id (0..N-1) and its slot is erased via eraseSlot in a finally that
 * runs on both success and failure.
 */

const EXPLORE_AGENT: AgentDefinition = {
	name: "explore",
	description: "Explore agent",
	systemPrompt: "default",
	source: "bundled",
	tools: ["read"],
};

const TWO_EXPLORE: TaskParams = {
	agent: "explore",
	tasks: [
		{ id: "task-a", description: "A", assignment: "do a" },
		{ id: "task-b", description: "B", assignment: "do b" },
	],
};

const ONE_EXPLORE: TaskParams = {
	agent: "explore",
	tasks: [{ id: "task-a", description: "A", assignment: "do a" }],
};

function stubResult(index: number, id: string): SingleResult {
	return {
		index,
		id,
		agent: "explore",
		agentSource: "bundled",
		task: "t",
		assignment: "a",
		description: "d",
		exitCode: 0,
		output: "",
		stderr: "",
		truncated: false,
		durationMs: 0,
		tokens: 0,
	};
}

function createSession(): ToolSession {
	return {
		cwd: "/tmp",
		hasUI: false,
		settings: Settings.isolated({
			"async.enabled": false,
			"task.isolation.mode": "none",
			"task.agentModelOverrides": { explore: "test-provider/some-model" },
		}),
		getSessionFile: () => null,
		getSessionSpawns: () => "*",
		modelRegistry: {
			authStorage: { getApiKey: async () => "test-key" },
			getModelsConfig: () => ({
				providers: {
					"test-provider": { baseUrl: "http://localhost:8080", localInferenceControl: true },
				},
			}),
			getApiKey: async () => "test-key",
			refresh: async () => {},
			getAvailable: () => [],
		} as unknown as ToolSession["modelRegistry"],
		authStorage: { getApiKey: async () => "test-key" },
		mcpManager: {} as ToolSession["mcpManager"],
		agentOutputManager: {
			allocateBatch: async (ids: string[]) => ids,
		} as unknown as ToolSession["agentOutputManager"],
		skills: [],
	} as unknown as ToolSession;
}

function mockConfig() {
	vi.spyOn(LocalInferenceConfigFile, "tryLoad").mockReturnValue({
		status: "ok",
		value: {
			ssh: { host: "test-host", restartScript: "~/ai.sh" },
			healthCheck: { timeoutMs: 500, pollIntervalMs: 10 },
			agentConcurrency: { explore: 2, task: 1 },
		},
	});
}

function mockDiscoverAgents(agent: AgentDefinition) {
	vi.spyOn(discoveryModule, "discoverAgents").mockResolvedValue({ agents: [agent], projectAgentsDir: null });
}

describe("local-inference slot erase", () => {
	afterEach(() => vi.restoreAllMocks());

	it("pins each explore subagent to a distinct slot and erases both on success", async () => {
		mockDiscoverAgents(EXPLORE_AGENT);
		mockConfig();
		vi.spyOn(localInferenceManager, "ensureLocalInferenceSlots").mockResolvedValue(2);
		vi.spyOn(planHandoff, "loadOverallPlanReference").mockResolvedValue(undefined);

		const log: string[] = [];
		vi.spyOn(executorModule, "runSubprocess").mockImplementation(async opts => {
			log.push(`run:${opts.localInferenceSlotId}`);
			return stubResult(opts.index, opts.id);
		});
		const eraseSpy = vi
			.spyOn(localInferenceManager, "eraseSlot")
			.mockImplementation(async (_url: string, slotId: number) => {
				log.push(`erase:${slotId}`);
				return true;
			});

		const tool = await TaskTool.create(createSession());
		await tool.execute("tool-call", TWO_EXPLORE);

		// runSubprocess got two distinct slot ids in {0,1}
		const runSlots = (executorModule.runSubprocess as any).mock.calls.map(
			(c: any) => (c[0] as { localInferenceSlotId?: number }).localInferenceSlotId,
		);
		expect(runSlots).toHaveLength(2);
		expect(new Set(runSlots)).toEqual(new Set([0, 1]));

		// eraseSlot called once per slot, same set
		const eraseSlots = (eraseSpy as any).mock.calls.map((c: any) => c[1] as number);
		expect(eraseSlots).toHaveLength(2);
		expect(new Set(eraseSlots)).toEqual(new Set([0, 1]));

		// each slot erased before its runSubprocess started (clean state on acquire)
		for (const slot of [0, 1]) {
			expect(log.indexOf(`erase:${slot}`)).toBeLessThan(log.indexOf(`run:${slot}`));
		}
	});

	it("erases the slot even when the subagent throws", async () => {
		mockDiscoverAgents(EXPLORE_AGENT);
		mockConfig();
		vi.spyOn(localInferenceManager, "ensureLocalInferenceSlots").mockResolvedValue(1);
		vi.spyOn(planHandoff, "loadOverallPlanReference").mockResolvedValue(undefined);
		vi.spyOn(executorModule, "runSubprocess").mockRejectedValue(new Error("boom"));
		const eraseSpy = vi.spyOn(localInferenceManager, "eraseSlot").mockResolvedValue(true);

		const tool = await TaskTool.create(createSession());
		await tool.execute("tool-call", ONE_EXPLORE);

		expect(eraseSpy).toHaveBeenCalledTimes(1);
		expect(eraseSpy.mock.calls[0]![1]).toBe(0);
	});
});
