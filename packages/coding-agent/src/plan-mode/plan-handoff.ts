import * as fs from "node:fs/promises";
import * as path from "node:path";
import { isEnoent } from "@oh-my-pi/pi-utils";
import { type LocalProtocolOptions, resolveLocalRoot, resolveLocalUrlToPath } from "../internal-urls";

/** The session's active plan, resolved for handoff into a subagent's context. */
export interface OverallPlanReference {
	/** The `local://` reference path (e.g. `local://my-feature.md`), kept for display. */
	path: string;
	/** The full plan markdown, as written to disk. */
	content: string;
}

/**
 * Load the session's active overall plan for subagent handoff.
 *
 * Returns the plan referenced by `planReferencePath` when it exists on disk with
 * non-empty content, or `undefined` when there is no plan (the file is absent or
 * empty). This mirrors `AgentSession.#buildPlanReferenceMessage`'s gating so a
 * subagent sees exactly the plan the main agent treats as its active reference.
 *
 * Callers MUST skip this during plan mode itself — read-only plan exploration
 * uses a different prompt and a draft plan should not be handed off as approved.
 */
export async function loadOverallPlanReference(
	planReferencePath: string,
	localProtocolOptions: LocalProtocolOptions,
): Promise<OverallPlanReference | undefined> {
	const resolved = resolveLocalUrlToPath(planReferencePath, localProtocolOptions);
	let content: string;
	try {
		content = await Bun.file(resolved).text();
	} catch (error) {
		if (isEnoent(error)) return undefined;
		throw error;
	}
	if (!content.trim()) return undefined;
	return { path: planReferencePath, content };
}

/**
 * Load all stage files from the session's local:// root for subagent handoff.
 * Returns an ordered list of stage references, or undefined when no stage files exist.
 * Stage files are sorted by their numeric index (stage-1.md, stage-2.md, etc.).
 */
export async function loadStagePlanReferences(
	localProtocolOptions: LocalProtocolOptions,
): Promise<OverallPlanReference[] | undefined> {
	const localRoot = resolveLocalRoot(localProtocolOptions);
	let entries: string[];
	try {
		const dirents = await fs.readdir(localRoot, { withFileTypes: true });
		entries = dirents
			.filter(e => e.isFile() && /^stage-\d+\.md$/i.test(e.name))
			.map(e => e.name)
			.sort();
	} catch {
		return undefined;
	}

	const stages: OverallPlanReference[] = [];
	for (const name of entries) {
		const fullPath = path.join(localRoot, name);
		try {
			const content = await Bun.file(fullPath).text();
			if (content.trim()) {
				stages.push({ path: `local://${name}`, content });
			}
		} catch (error) {
			if (!isEnoent(error)) throw error;
		}
	}

	return stages.length > 0 ? stages : undefined;
}
