import { describe, expect, test } from "bun:test";
import { loadBundledAgents } from "../../src/task/agents";

describe("debug bundled agent", () => {
  const agents = loadBundledAgents();

  test("debug agent is discovered", () => {
    const debug = agents.find(a => a.name === "debug");
    expect(debug).toBeDefined();
  });

  test("debug agent has correct fields", () => {
    const debug = agents.find(a => a.name === "debug");
    expect(debug).toBeDefined();
    expect(debug!.description).toContain("Debugging specialist");
    expect(debug!.blocking).toBe(true);
    expect(debug!.disableMCP).toBe(false);
    expect(debug!.mcpPrompt).toBe(true);
    expect(debug!.model).toBeUndefined();
    expect(debug!.spawns).toBeUndefined();
  });

  test("debug agent tools include debug and exclude disablemcp", () => {
    const debug = agents.find(a => a.name === "debug");
    expect(debug).toBeDefined();
    expect(debug!.tools).toContain("debug");
    expect(debug!.tools).toContain("bash");
    expect(debug!.tools).toContain("edit");
    expect(debug!.tools).toContain("write");
    expect(debug!.tools).not.toContain("disablemcp");
    expect(debug!.tools).toContain("yield");
  });

  test("debug agent has all 31 mcp-preactivate tools", () => {
    const debug = agents.find(a => a.name === "debug");
    expect(debug).toBeDefined();
    expect(debug!.mcpPreactivate).toBeDefined();
    expect(debug!.mcpPreactivate!.length).toBe(31);
    expect(debug!.mcpPreactivate).toContain("switch_project");
    expect(debug!.mcpPreactivate).toContain("search_codebase");
    expect(debug!.mcpPreactivate).toContain("find_dead_code");
  });

  test("debug agent system prompt contains debugging rules and DAP instructions", () => {
    const debug = agents.find(a => a.name === "debug");
    expect(debug).toBeDefined();
    expect(debug!.systemPrompt).toContain("never speculate about a bug without reading");
    expect(debug!.systemPrompt).toContain("DAP");
    expect(debug!.systemPrompt).toContain("switch_project");
  });
});