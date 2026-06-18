import { describe, expect, it } from "bun:test";
import { prompt } from "@oh-my-pi/pi-utils";
import planModeApprovedPrompt from "../../src/prompts/system/plan-mode-approved.md" with { type: "text" };

/**
 * Contract: when `localInferenceSlotLimit` is passed to the plan-mode-approved
 * template, the rendered prompt includes a hard instruction about the slot
 * limit before the `<instruction>` tag. When undefined, no such block appears.
 */

describe("plan-mode-approved template slot-limit block", () => {
	const baseVars = {
		stageFiles: [{ path: "local://stage-1.md", index: 1 }],
		contextPreserved: false,
	};

	it("renders slot-limit instruction when localInferenceSlotLimit is set", () => {
		const rendered = prompt.render(planModeApprovedPrompt, {
			...baseVars,
			localInferenceSlotLimit: 1,
		});

		expect(rendered).toContain("The model server for this session runs with 1 parallel slot(s)");
		expect(rendered).toContain("each `task` call must contain exactly 1 task");
		// The slot-limit block must appear before the <instruction> tag
		const slotPos = rendered.indexOf("parallel slot");
		const instructionPos = rendered.indexOf("<instruction>");
		expect(slotPos).toBeGreaterThan(0);
		expect(instructionPos).toBeGreaterThan(slotPos);
	});

	it("renders no slot-limit block when localInferenceSlotLimit is undefined", () => {
		const rendered = prompt.render(planModeApprovedPrompt, {
			...baseVars,
			localInferenceSlotLimit: undefined,
		});

		expect(rendered).not.toContain("parallel slot");
	});

	it("renders no slot-limit block when the key is omitted entirely", () => {
		const rendered = prompt.render(planModeApprovedPrompt, baseVars);

		expect(rendered).not.toContain("parallel slot");
	});
});
