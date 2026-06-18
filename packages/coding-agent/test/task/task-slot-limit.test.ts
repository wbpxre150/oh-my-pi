import { afterEach, describe, expect, it, vi } from "bun:test";
import { LocalInferenceConfigFile } from "../../src/config/local-inference-config";
import { Settings } from "../../src/config/settings";
import { TaskTool } from "../../src/task";
import * as discoveryModule from "../../src/task/discovery";
import * as localInferenceManager from "../../src/task/local-inference-manager";
import type { AgentDefinition, TaskParams } from "../../src/task/types";
import type { ToolSession } from "../../src/tools";

/**
 * Contract: when `localInferenceControl` is active and the submitted task count
 * exceeds the server's slot budget, a hard error is returned immediately
 * (before any subagent starts) instead of silently serializing.
 */

const TASK_AGENT: AgentDefinition = {
	name: "task",
	description: "Task agent",
	systemPrompt: "default",
	source: "bundled",
	tools: [],
};

const TEST_EXPLORE: TaskParams = {
	agent: "explore",
	tasks: [
		{ id: "task-a", description: "A", assignment: "do a" },
		{ id: "task-b", description: "B", assignment: "do b" },
		{ id: "task-c", description: "C", assignment: "do c" },
	],
};

const TEST_TASK_1: TaskParams = {
	agent: "task",
	tasks: [{ id: "task-1", description: "First", assignment: "do first" }],
};

const TEST_TASK_2: TaskParams = {
	agent: "task",
	tasks: [
		{ id: "task-1", description: "First", assignment: "do first" },
		{ id: "task-2", description: "Second", assignment: "do second" },
	],
};

function createSession(): ToolSession {
	return {
		cwd: "/tmp",
		hasUI: false,
		settings: Settings.isolated({
			"async.enabled": false,
			"task.isolation.mode": "none",
			"task.agentModelOverrides": { task: "test-provider/some-model", explore: "test-provider/some-model" },
		}),
		getSessionFile: () => null,
		getSessionSpawns: () => "*",
		modelRegistry: {
			authStorage: {
				getApiKey: async () => "test-key",
			},
			getModelsConfig: () => ({
				providers: {
					"test-provider": {
						baseUrl: "http://localhost:8080",
						localInferenceControl: true,
					},
				},
			}),
			getApiKey: async () => "test-key",
			refresh: async () => {},
			getAvailable: () => [],
		} as unknown as ToolSession["modelRegistry"],
		authStorage: {
			getApiKey: async () => "test-key",
		},
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

function mockEnsureSlots(returnValue: number) {
	vi.spyOn(localInferenceManager, "ensureLocalInferenceSlots").mockResolvedValue(returnValue);
}

function mockDiscoverAgents(agent: AgentDefinition) {
	vi.spyOn(discoveryModule, "discoverAgents").mockResolvedValue({
		agents: [agent],
		projectAgentsDir: null,
	});
}

describe("task slot limit validation", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('agent "task" with 2 tasks returns slot-limit error', async () => {
		mockDiscoverAgents(TASK_AGENT);
		mockConfig();
		const slotsSpy = vi.spyOn(localInferenceManager, "ensureLocalInferenceSlots");

		const tool = await TaskTool.create(createSession());
		const result = await tool.execute("tool-call", TEST_TASK_2);

		const text = result.content?.[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain("task agents run serially on this server (1 slot)");
		expect(slotsSpy).not.toHaveBeenCalled();
	});

	it('agent "task" with 1 task proceeds (ensureLocalInferenceSlots called)', async () => {
		mockDiscoverAgents(TASK_AGENT);
		mockConfig();
		mockEnsureSlots(1);

		const tool = await TaskTool.create(createSession());
		const result = await tool.execute("tool-call", TEST_TASK_1);

		const text = result.content?.[0]?.type === "text" ? result.content[0].text : "";
		expect(text).not.toContain("task agents run serially");
	});

	it('agent "explore" with 3 tasks (limit 2) returns explore-limit error', async () => {
		mockDiscoverAgents({ ...TASK_AGENT, name: "explore" });
		mockConfig();
		const slotsSpy = vi.spyOn(localInferenceManager, "ensureLocalInferenceSlots");

		const tool = await TaskTool.create(createSession());
		const result = await tool.execute("tool-call", TEST_EXPLORE);

		const text = result.content?.[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain("explore agents are limited to 2 parallel slot(s)");
		expect(slotsSpy).not.toHaveBeenCalled();
	});

	it('agent "explore" with 2 tasks (within limit) proceeds', async () => {
		mockDiscoverAgents({ ...TASK_AGENT, name: "explore" });
		mockConfig();
		mockEnsureSlots(2);

		const tool = await TaskTool.create(createSession());
		const result = await tool.execute("tool-call", {
			agent: "explore",
			tasks: [
				{ id: "task-a", description: "A", assignment: "do a" },
				{ id: "task-b", description: "B", assignment: "do b" },
			],
		});

		const text = result.content?.[0]?.type === "text" ? result.content[0].text : "";
		expect(text).not.toContain("explore agents are limited to");
	});

	it("without local inference active, 2-task task call proceeds (no error)", async () => {
		mockDiscoverAgents(TASK_AGENT);

		const tool = await TaskTool.create(createSession());
		const result = await tool.execute("tool-call", TEST_TASK_2);

		const text = result.content?.[0]?.type === "text" ? result.content[0].text : "";
		expect(text).not.toContain("task agents run serially");
	});
});
