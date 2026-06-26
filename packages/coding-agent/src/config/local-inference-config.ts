import * as z from "zod/v4";
import { ConfigFile } from "./config-file";

export type ModelTier = "f" | "s" | "r";

export const LocalInferenceConfigSchema = z.object({
	ssh: z
		.object({
			/** user@host string for SSH, e.g. "adam@192.168.0.24" */
			host: z.string().min(1).optional(),
			/**
			 * Path to the restart script on the remote host.
			 * Called as: ssh <host> "<restartScript> <slots>"
			 * The remote shell expands ~ so "~/ai.sh" works.
			 */
			restartScript: z.string().min(1).default("~/ai.sh"),
		})
		.default({ restartScript: "~/ai.sh" }),
	/**
	 * Override the health-check URL. If omitted, derived from the provider's
	 * baseUrl in models.yml by appending "/health".
	 */
	healthCheckUrl: z.string().url().optional(),
	healthCheck: z
		.object({
			/** How long to wait for the server to come up after restart (ms). */
			timeoutMs: z.number().int().positive().default(30_000),
			/** How often to poll the health endpoint (ms). */
			pollIntervalMs: z.number().int().positive().default(500),
		})
		.default({ timeoutMs: 30_000, pollIntervalMs: 500 }),
	agentConcurrency: z
		.object({
			/**
			 * Maximum parallel slots (and subagents) for the `explore` agent type.
			 * The TaskTool effective concurrency becomes min(task.maxConcurrency, explore).
			 */
			explore: z.number().int().positive().default(2),
			/**
			 * Slots for the `task` agent type (and all other non-explore agents).
			 * Should be 1 to maximize context window per task.
			 */
			task: z.number().int().positive().default(1),
			/**
			 * Slots for the `reasoning` agent type.
			 * Should be 1 as reasoning models are heavy and serial.
			 */
			reasoning: z.number().int().positive().default(1),
		})
		.default({ explore: 2, task: 1, reasoning: 1 }),
	modelTier: z
		.object({
			/**
			 * Model tier passed to the remote restart script for the `explore` agent.
			 * "f" = fast 35B model. Explore agents are lightweight and benefit from the
			 * faster model.
			 */
			explore: z.enum(["f", "s", "r"]).default("f"),
			/**
			 * Model tier for the `task` agent (and all other non-explore agents).
			 * "s" = slow 27B model. Task agents run serially with maximum context.
			 */
			task: z.enum(["s", "f", "r"]).default("s"),
			/**
			 * Model tier for the `reasoning` agent.
			 * "r" = reasoning model loaded with reasoning-enabled server config.
			 */
			reasoning: z.enum(["f", "s", "r"]).default("r"),
		})
		.default({ explore: "f", task: "s", reasoning: "r" }),
});

export type LocalInferenceConfig = z.infer<typeof LocalInferenceConfigSchema>;

/** Singleton config file loader for ~/.omp/agent/local-inference.yml */
export const LocalInferenceConfigFile = new ConfigFile("local-inference", LocalInferenceConfigSchema);

/**
 * Resolve local-inference slot limit and model tier based on agent name.
 * - explore -> fast tier (f), explore concurrency
 * - reasoning -> reasoning tier (r), reasoning concurrency (1)
 * - everything else (task, etc.) -> slow tier (s), task concurrency
 */
export function resolveLocalInferenceTier(
	agentName: string,
	config: LocalInferenceConfig,
): { slotLimit: number; desiredTier: ModelTier } {
	if (agentName === "explore") {
		return { slotLimit: config.agentConcurrency.explore, desiredTier: config.modelTier.explore };
	}
	if (agentName === "reasoning") {
		return { slotLimit: config.agentConcurrency.reasoning, desiredTier: config.modelTier.reasoning };
	}
	return { slotLimit: config.agentConcurrency.task, desiredTier: config.modelTier.task };
}
