import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ModelRegistry } from "@oh-my-pi/pi-coding-agent/config/model-registry";
import { resetSettingsForTest } from "@oh-my-pi/pi-coding-agent/config/settings";
import { AuthStorage } from "@oh-my-pi/pi-coding-agent/session/auth-storage";
import { Snowflake } from "@oh-my-pi/pi-utils";

describe("ModelRegistry localInferenceControl flag", () => {
	let tempDir: string;
	let modelsJsonPath: string;
	let authStorage: AuthStorage;

	beforeEach(async () => {
		resetSettingsForTest();
		tempDir = path.join(os.tmpdir(), `pi-test-local-inf-${Snowflake.next()}`);
		fs.mkdirSync(tempDir, { recursive: true });
		modelsJsonPath = path.join(tempDir, "models.json");
		authStorage = await AuthStorage.create(":memory:");
	});

	afterEach(() => {
		resetSettingsForTest();
		authStorage.close();
		if (tempDir && fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true });
	});

	function writeConfig(providers: Record<string, unknown>) {
		fs.writeFileSync(modelsJsonPath, JSON.stringify({ providers }));
	}

	function modelEntry(id: string) {
		return {
			id,
			name: id,
			reasoning: false,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 100000,
			maxTokens: 8000,
		};
	}

	type ModelEntry = ReturnType<typeof modelEntry>;

	function providerConfig(baseUrl: string, models: ModelEntry[], extra: Record<string, unknown> = {}) {
		return {
			baseUrl,
			apiKey: "TEST_KEY",
			api: "openai-completions",
			models,
			...extra,
		};
	}

	test("stamps localInferenceControl on models under a controlled provider", () => {
		writeConfig({
			llamacpp: providerConfig("http://192.168.0.24:8081/v1", [modelEntry("qwen-local")], {
				localInferenceControl: true,
			}),
			openrouter: providerConfig("https://openrouter.ai/api/v1", [modelEntry("z-ai/glm-5.2")]),
		});

		const registry = new ModelRegistry(authStorage, modelsJsonPath);
		const llamacppModels = registry.getAll().filter(m => m.provider === "llamacpp");
		const openrouterModels = registry.getAll().filter(m => m.provider === "openrouter");

		expect(llamacppModels.length).toBeGreaterThan(0);
		expect(llamacppModels.every(m => m.localInferenceControl === true)).toBe(true);

		expect(openrouterModels.length).toBeGreaterThan(0);
		expect(openrouterModels.every(m => m.localInferenceControl === undefined)).toBe(true);
	});

	test("does not stamp the flag when localInferenceControl is false or absent", () => {
		writeConfig({
			cloudA: providerConfig("https://a.example.com/v1", [modelEntry("a-1")], {
				localInferenceControl: false,
			}),
			cloudB: providerConfig("https://b.example.com/v1", [modelEntry("b-1")]),
		});

		const registry = new ModelRegistry(authStorage, modelsJsonPath);
		const all = registry.getAll().filter(m => m.provider === "cloudA" || m.provider === "cloudB");
		expect(all.length).toBeGreaterThan(0);
		expect(all.every(m => m.localInferenceControl === undefined)).toBe(true);
	});
});
