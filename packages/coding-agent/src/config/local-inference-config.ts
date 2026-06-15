import * as z from "zod/v4";
import { ConfigFile } from "./config-file";

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
		})
		.default({ explore: 2, task: 1 }),
});

export type LocalInferenceConfig = z.infer<typeof LocalInferenceConfigSchema>;

/** Singleton config file loader for ~/.omp/agent/local-inference.yml */
export const LocalInferenceConfigFile = new ConfigFile("local-inference", LocalInferenceConfigSchema);
