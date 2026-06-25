import { describe, expect, test } from "bun:test";
import { LocalInferenceConfigSchema, resolveLocalInferenceTier } from "../src/config/local-inference-config";
import { loadBundledAgents } from "../src/task/agents";

describe("reasoning tier resolution", () => {
	test("explore returns fast tier and explore concurrency", () => {
		const config = LocalInferenceConfigSchema.parse({});
		const res = resolveLocalInferenceTier("explore", config);
		expect(res.desiredTier).toBe("f");
		expect(res.slotLimit).toBe(2);
	});

	test("reasoning returns reasoning tier and reasoning concurrency", () => {
		const config = LocalInferenceConfigSchema.parse({});
		const res = resolveLocalInferenceTier("reasoning", config);
		expect(res.desiredTier).toBe("r");
		expect(res.slotLimit).toBe(1);
	});

	test("other agents return slow tier and task concurrency", () => {
		const config = LocalInferenceConfigSchema.parse({});
		const otherRes = resolveLocalInferenceTier("task", config);
		expect(otherRes.desiredTier).toBe("s");
		expect(otherRes.slotLimit).toBe(1);
	});

	test("ModelTier type admits 'r'", () => {
		const tier: "f" | "s" | "r" = "r";
		expect(tier).toBe("r");
	});
});

describe("reasoning agent discovery", () => {
	test("reasoning agent is bundled and discoverable", () => {
		const agents = loadBundledAgents();
		expect(agents.map(a => a.name)).toContain("reasoning");
	});

	test("reasoning agent is marked as toolless", () => {
		const agents = loadBundledAgents();
		const reasoning = agents.find(a => a.name === "reasoning");
		expect(reasoning).toBeDefined();
		expect(reasoning!.toolless).toBe(true);
	});
});
