import { describe, expect, test } from "bun:test";
import { LocalInferenceConfigSchema } from "../src/config/local-inference-config";
import { parseAgentFields } from "../src/discovery/helpers";
import { clearBundledAgentsCache, loadBundledAgents } from "../src/task/agents";

describe("reasoning agent foundation", () => {
	test("reasoning agent is bundled with toolless flag", () => {
		clearBundledAgentsCache();
		const agents = loadBundledAgents();
		const reasoning = agents.find(a => a.name === "reasoning");
		expect(reasoning).toBeDefined();
		expect(reasoning!.toolless).toBe(true);
		expect(reasoning!.model).toEqual(["pi/task"]);
		expect(reasoning!.systemPrompt).toContain("reasoning");
	});

	test("parseAgentFields parses toolless from frontmatter", () => {
		const fields = parseAgentFields({
			name: "test",
			description: "test agent",
			toolless: true,
		});
		expect(fields).not.toBeNull();
		expect(fields!.toolless).toBe(true);
	});

	test("parseAgentFields defaults toolless to undefined when absent", () => {
		const fields = parseAgentFields({ name: "test", description: "test" });
		expect(fields!.toolless).toBeUndefined();
	});

	test("local-inference config has reasoning tier and concurrency defaults", () => {
		const cfg = LocalInferenceConfigSchema.parse({});
		expect(cfg.modelTier.reasoning).toBe("r");
		expect(cfg.agentConcurrency.reasoning).toBe(5);
	});
});
