import { describe, expect, test } from "bun:test";
import { runToollessSubagent } from "../src/task/executor";
import type { AgentDefinition, SingleResult } from "../src/task/types";

const reasoningAgent: AgentDefinition = {
	name: "reasoning",
	description: "reasoning specialist",
	systemPrompt: "You are a reasoning agent. Return a concrete solution.",
	source: "bundled",
	toolless: true,
	model: ["pi/task"],
};

const model = { provider: "llamacpp", id: "qwen-3.6", contextWindow: 32768 } as any;

describe("reasoning agent dispatch contract", () => {
	test("success: SingleResult is aggregation-compatible", async () => {
		const session = {
			runToollessTurn: async () => ({
				replyText: "## Changes\n- edit foo.ts",
				assistantMessage: { usage: { totalTokens: 42, input: 30, output: 12 } },
			}),
		} as any;

		const result: SingleResult = await runToollessSubagent({
			agent: reasoningAgent,
			task: "Reason about X",
			assignment: "Reason about X",
			context: "Shared context",
			description: "probe",
			index: 0,
			id: "probe1",
			model,
			signal: new AbortController().signal,
			session,
			taskStart: Date.now(),
		});

		expect(result.exitCode).toBe(0);
		expect(result.output).toContain("## Changes");
		expect(result.agent).toBe("reasoning");
		expect(result.agentSource).toBe("bundled");
		expect(result.resolvedModel).toBe("llamacpp/qwen-3.6");
		expect(result.tokens).toBe(42);
		expect(result.durationMs).toBeGreaterThanOrEqual(0);
		expect(result.outputMeta?.lineCount).toBeGreaterThan(0);
		expect(result.outputMeta?.charCount).toBe(result.output.length);
		expect(result.patchPath).toBeUndefined();
		expect(result.branchName).toBeUndefined();
	});

	test("empty reply still returns a valid result", async () => {
		const session = {
			runToollessTurn: async () => ({ replyText: "", assistantMessage: { usage: undefined } }),
		} as any;

		const result = await runToollessSubagent({
			agent: reasoningAgent,
			task: "t",
			assignment: "t",
			index: 0,
			id: "t1",
			model,
			signal: new AbortController().signal,
			session,
			taskStart: Date.now(),
		});

		expect(result.exitCode).toBe(0);
		expect(result.output).toBe("");
		expect(result.tokens).toBe(0);
		expect(result.outputMeta?.lineCount).toBe(1);
	});
});
