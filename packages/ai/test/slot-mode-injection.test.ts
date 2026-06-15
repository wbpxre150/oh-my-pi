import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentDir } from "@oh-my-pi/pi-utils";
import { getBundledModel } from "../src/models";
import { streamOpenAICompletions } from "../src/providers/openai-completions";
import type { Context, Model } from "../src/types";

const slotModeFile = path.join(getAgentDir(), ".local-inference-slot-mode");
const TEST_BASE_URL = "http://localhost:8080";

function writeSlotModeFile(baseUrl: string): void {
	fs.writeFileSync(slotModeFile, JSON.stringify({ baseUrl }), "utf-8");
}

function deleteSlotModeFile(): void {
	try {
		fs.unlinkSync(slotModeFile);
	} catch {
		// ignore
	}
}

function baseContext(): Context {
	return {
		messages: [{ role: "user", content: "hello", timestamp: Date.now() }],
	};
}

function createAbortedSignal(): AbortSignal {
	const controller = new AbortController();
	controller.abort();
	return controller.signal;
}
describe("slot-mode id_slot injection", () => {
	beforeAll(() => deleteSlotModeFile());
	afterAll(() => deleteSlotModeFile());
	function getModel(baseUrl: string): Model<"openai-completions"> {
		return {
			...getBundledModel("openai", "gpt-4o-mini"),
			api: "openai-completions",
			baseUrl,
		};
	}
	it("injects id_slot=0 when indicator file exists and URL matches", async () => {
		writeSlotModeFile(TEST_BASE_URL);
		const model = getModel(TEST_BASE_URL);
		const { promise, resolve } = Promise.withResolvers<unknown>();
		globalThis.fetch = Object.assign(async () => new Response(""), { preconnect: globalThis.fetch.preconnect });
		streamOpenAICompletions(model, baseContext(), {
			apiKey: "test-key",
			signal: createAbortedSignal(),
			onPayload: (p: unknown) => resolve(p),
		});
		const payload = await promise;
		expect((payload as Record<string, unknown>).id_slot).toBe(0);
	});
	it("does not inject id_slot when indicator file is missing", async () => {
		deleteSlotModeFile();
		const model = getModel(TEST_BASE_URL);
		const { promise, resolve } = Promise.withResolvers<unknown>();
		globalThis.fetch = Object.assign(async () => new Response(""), { preconnect: globalThis.fetch.preconnect });
		streamOpenAICompletions(model, baseContext(), {
			apiKey: "test-key",
			signal: createAbortedSignal(),
			onPayload: (p: unknown) => resolve(p),
		});
		const payload = await promise;
		expect((payload as Record<string, unknown>).id_slot).toBeUndefined();
	});
	it("does not inject id_slot when URL does not match", async () => {
		writeSlotModeFile("http://localhost:9090");
		const model = getModel("http://localhost:8080");
		const { promise, resolve } = Promise.withResolvers<unknown>();
		globalThis.fetch = Object.assign(async () => new Response(""), { preconnect: globalThis.fetch.preconnect });
		streamOpenAICompletions(model, baseContext(), {
			apiKey: "test-key",
			signal: createAbortedSignal(),
			onPayload: (p: unknown) => resolve(p),
		});
		const payload = await promise;
		expect((payload as Record<string, unknown>).id_slot).toBeUndefined();
	});
	it("preserves explicit id_slot in extraBody when indicator file exists", async () => {
		writeSlotModeFile(TEST_BASE_URL);
		const model = getModel(TEST_BASE_URL);
		const { promise, resolve } = Promise.withResolvers<unknown>();
		globalThis.fetch = Object.assign(async () => new Response(""), { preconnect: globalThis.fetch.preconnect });
		const compatModel = {
			...model,
			compat: { extraBody: { id_slot: -1 } },
		};
		streamOpenAICompletions(compatModel, baseContext(), {
			apiKey: "test-key",
			signal: createAbortedSignal(),
			onPayload: (p: unknown) => resolve(p),
		});
		const payload = await promise;
		expect((payload as Record<string, unknown>).id_slot).toBe(-1);
	});
});
