import { describe, expect, test } from "bun:test";

describe("main agent system prompt excludes MCP activation protocol", () => {
	test("main.ts does not import mcpToolsPrompt", async () => {
		const source = await Bun.file("packages/coding-agent/src/main.ts").text();
		expect(source).not.toContain("mcpToolsPrompt");
	});

	test("main.ts does not reference mcp-tools.md", async () => {
		const source = await Bun.file("packages/coding-agent/src/main.ts").text();
		expect(source).not.toContain("mcp-tools.md");
	});
});
