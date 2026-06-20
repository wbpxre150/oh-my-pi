import { describe, expect, test } from "bun:test";
import { getStreamMarkupHealingPattern } from "../src/utils/stream-markup-healing";

describe("generic-xml gate smoke", () => {
	test("openrouter model without localInferenceControl gets no generic-xml healing", () => {
		expect(getStreamMarkupHealingPattern("openrouter", "z-ai/glm-5.2")).toBeUndefined();
	});
	test("llamacpp model with localInferenceControl gets generic-xml healing", () => {
		expect(getStreamMarkupHealingPattern("llamacpp", "qwen-local", { localInferenceControl: true })).toBe(
			"generic-xml",
		);
	});
});
