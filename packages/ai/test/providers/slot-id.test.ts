import { describe, expect, it } from "bun:test";
import { getActiveSlotId, runWithSlotId } from "../../src/providers/openai-completions";

describe("runWithSlotId / getActiveSlotId", () => {
	it("exposes the slot id inside the scope and clears it outside", async () => {
		expect(getActiveSlotId()).toBeUndefined();
		const seen = await runWithSlotId(3, async () => {
			return getActiveSlotId();
		});
		expect(seen).toBe(3);
		expect(getActiveSlotId()).toBeUndefined();
	});

	it("propagates across awaited continuations", async () => {
		const observed: number[] = [];
		await runWithSlotId(1, async () => {
			observed.push(getActiveSlotId()!);
			await Bun.sleep(0);
			observed.push(getActiveSlotId()!);
		});
		expect(observed).toEqual([1, 1]);
	});

	it("keeps parallel scopes isolated", async () => {
		const captured = await Promise.all([
			runWithSlotId(0, async () => {
				await Bun.sleep(0);
				return getActiveSlotId();
			}),
			runWithSlotId(1, async () => {
				await Bun.sleep(0);
				return getActiveSlotId();
			}),
		]);
		expect(captured).toEqual([0, 1]);
	});
});
