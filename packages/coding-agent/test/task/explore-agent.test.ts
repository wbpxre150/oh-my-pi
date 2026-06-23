import { describe, expect, test } from "bun:test";
import { loadBundledAgents } from "../../src/task/agents";

describe("explore bundled agent", () => {
	const agents = loadBundledAgents();

	test("explore agent is discovered", () => {
		const explore = agents.find(a => a.name === "explore");
		expect(explore).toBeDefined();
	});

	test("explore agent mcp-preactivate includes switch_project", () => {
		const explore = agents.find(a => a.name === "explore");
		expect(explore).toBeDefined();
		expect(explore!.mcpPreactivate).toBeDefined();
		expect(explore!.mcpPreactivate).toContain("switch_project");
	});

	test("explore agent system prompt instructs switch_project", () => {
		const explore = agents.find(a => a.name === "explore");
		expect(explore).toBeDefined();
		expect(explore!.systemPrompt).toContain("switch_project");
	});
});
