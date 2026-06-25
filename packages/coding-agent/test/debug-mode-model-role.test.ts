/**
 * Tests for the debug model role resolution contract.
 *
 * Debug mode (`/db`) resolves its model the same way plan mode does:
 * `resolveRoleModelWithThinking("debug")` returns the configured model +
 * thinking level, or `{ model: undefined }` when the debug role is unset
 * (in which case #applyDebugModeModel returns early and debug mode
 * inherits the current session model).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import * as path from "node:path";
import { Agent, ThinkingLevel } from "@oh-my-pi/pi-agent-core";
import { ModelRegistry } from "@oh-my-pi/pi-coding-agent/config/model-registry";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { AgentSession } from "@oh-my-pi/pi-coding-agent/session/agent-session";
import { AuthStorage } from "@oh-my-pi/pi-coding-agent/session/auth-storage";
import { SessionManager } from "@oh-my-pi/pi-coding-agent/session/session-manager";
import { TempDir } from "@oh-my-pi/pi-utils";

describe("debug model role resolution", () => {
	let tempDir: TempDir;
	let session: AgentSession;
	let modelRegistry: ModelRegistry;
	let authStorage: AuthStorage;

	beforeAll(async () => {
		tempDir = TempDir.createSync("@pi-debug-role-");
		authStorage = await AuthStorage.create(path.join(tempDir.path(), "testauth.db"));
		authStorage.setRuntimeApiKey("anthropic", "test-key");
		modelRegistry = new ModelRegistry(authStorage);
	});

	afterEach(async () => {
		if (session) {
			await session.dispose();
		}
	});

	afterAll(() => {
		authStorage.close();
		tempDir.removeSync();
	});

	function createSessionWithRoles(modelRoles: Record<string, string>): AgentSession {
		const sonnet = modelRegistry.find("anthropic", "claude-sonnet-4-5");
		if (!sonnet) throw new Error("Expected claude-sonnet-4-5 to exist in registry");

		session = new AgentSession({
			agent: new Agent({
				initialState: { model: sonnet, systemPrompt: ["Test"], tools: [], messages: [] },
			}),
			sessionManager: SessionManager.inMemory(),
			settings: Settings.isolated({ modelRoles }),
			modelRegistry,
		});
		return session;
	}

	describe("resolveRoleModelWithThinking", () => {
		it("returns thinking level when debug role includes a thinking suffix", () => {
			createSessionWithRoles({ debug: "anthropic/claude-sonnet-4-5:xhigh" });

			const result = session.resolveRoleModelWithThinking("debug");

			expect(result.model).toBeDefined();
			expect(result.model!.provider).toBe("anthropic");
			expect(result.model!.id).toBe("claude-sonnet-4-5");
			expect(result.thinkingLevel).toBe(ThinkingLevel.XHigh);
			expect(result.explicitThinkingLevel).toBe(true);
		});

		it("returns no explicit thinking level when debug role has no thinking suffix", () => {
			createSessionWithRoles({ debug: "anthropic/claude-sonnet-4-5" });

			const result = session.resolveRoleModelWithThinking("debug");

			expect(result.model).toBeDefined();
			expect(result.model!.id).toBe("claude-sonnet-4-5");
			expect(result.explicitThinkingLevel).toBe(false);
		});

		it("returns no model when no debug role is configured (inherit current model)", () => {
			createSessionWithRoles({});

			const result = session.resolveRoleModelWithThinking("debug");

			expect(result.model).toBeUndefined();
		});

		it("resolveRoleModel returns just the model (backward compat)", () => {
			createSessionWithRoles({ debug: "anthropic/claude-sonnet-4-5:xhigh" });

			const model = session.resolveRoleModel("debug");
			expect(model).toBeDefined();
			expect(model!.provider).toBe("anthropic");
			expect(model!.id).toBe("claude-sonnet-4-5");
		});
	});
});
