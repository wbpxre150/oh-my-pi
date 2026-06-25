import { describe, expect, test } from "bun:test";
import type { ThinkingLevel } from "@oh-my-pi/pi-agent-core";
import type { Api, Model, Usage } from "@oh-my-pi/pi-ai";
import type { AgentSession } from "../src/session/agent-session";
import { runToollessSubagent } from "../src/task/executor";
import type { AgentDefinition, SingleResult } from "../src/task/types";

const fakeAgent: AgentDefinition = {
	name: "reasoning",
	description: "test",
	systemPrompt: "You are a reasoning agent.",
	source: "bundled",
	toolless: true,
};

const fakeModel: Model<Api> = {
	provider: "llamacpp",
	id: "qwen-3.6",
	contextWindow: 32768,
} as unknown as Model<Api>;

function makeSession(
	replyText: string,
	usage: Usage = { totalTokens: 100, input: 80, output: 20 },
): AgentSession {
	return {
		runToollessTurn: async () => ({
			replyText,
			assistantMessage: { usage } as unknown as { usage: Usage },
		}),
	} as unknown as AgentSession;
}

describe("runToollessSubagent", () => {
	test("returns SingleResult with streamed text on success", async () => {
		const result = await runToollessSubagent({
			agent: fakeAgent,
			task: "Solve X",
			context: "Background",
			assignment: "Solve X",
			description: "desc",
			index: 0,
			id: "t1",
			model: fakeModel,
			thinkingLevel: "high" as unknown as ThinkingLevel,
			signal: new AbortController().signal,
			session: makeSession("THE SOLUTION"),
			taskStart: Date.now(),
		});
		expect(result.exitCode).toBe(0);
		expect(result.output).toBe("THE SOLUTION");
		expect(result.agent).toBe("reasoning");
		expect(result.resolvedModel).toBe("llamacpp/qwen-3.6");
		expect(result.tokens).toBe(100);
		expect(result.contextWindow).toBe(32768);
		expect(result.outputMeta?.lineCount).toBeGreaterThan(0);
		expect(result.error).toBeUndefined();
	});

	test("prepends shared context to the task", async () => {
		let captured: string | undefined;
		const session: AgentSession = {
			runToollessTurn: async (args: { userMessage: string }) => {
				captured = args.userMessage;
				return {
					replyText: "ok",
					assistantMessage: { usage: { totalTokens: 1 } as Usage },
				} as unknown as { replyText: string; assistantMessage: { usage?: Usage } };
			},
		} as unknown as AgentSession;
		await runToollessSubagent({
			agent: fakeAgent,
			task: "TASK",
			context: "CTX",
			assignment: "TASK",
			index: 0,
			id: "t1",
			model: fakeModel,
			signal: new AbortController().signal,
			session,
			taskStart: Date.now(),
		});
		expect(captured).toBe("CTX\n\nTASK");
	});

	test("returns exitCode 1 with error when runToollessTurn throws", async () => {
		const session: AgentSession = {
			runToollessTurn: async () => {
				throw new Error("boom");
			},
		} as unknown as AgentSession;
		const result: SingleResult = await runToollessSubagent({
			agent: fakeAgent,
			task: "TASK",
			assignment: "TASK",
			index: 0,
			id: "t1",
			model: fakeModel,
			signal: new AbortController().signal,
			session,
			taskStart: Date.now(),
		});
		expect(result.exitCode).toBe(1);
		expect(result.error).toBe("boom");
		expect(result.stderr).toBe("boom");
		expect(result.output).toBe("");
		expect(result.aborted).toBeUndefined();
	});

	test("returns aborted result when signal already aborted", async () => {
		const ac = new AbortController();
		ac.abort(new Error("cancelled by parent"));
		const result = await runToollessSubagent({
			agent: fakeAgent,
			task: "TASK",
			assignment: "TASK",
			index: 0,
			id: "t1",
			model: fakeModel,
			signal: ac.signal,
			session: makeSession("never"),
			taskStart: Date.now(),
		});
		expect(result.exitCode).toBe(1);
		expect(result.aborted).toBe(true);
		expect(result.abortReason).toBe("cancelled by parent");
	});
});