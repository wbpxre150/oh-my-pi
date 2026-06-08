import { getReadToolPath, type ProtectedToolContext } from "@oh-my-pi/pi-agent-core/compaction/tool-protection";
import { normalizeLocalScheme } from "../tools/path-utils";

/** Canonical plan alias every session's `local://` root resolves. */
const LOCAL_PLAN_ALIAS = "local://PLAN.md";

/** Pattern matching stage-*.md filenames (e.g. local://stage-1.md). */
const STAGE_PATTERN = /^stage-\d+\.md$/;

/** True when `readPath` targets `planTarget`, ignoring `local:/` vs `local://`
 *  scheme spelling and any trailing read selector (`:1-50`, `:raw`, …). */
function readTargetsPlan(readPath: string, planTarget: string): boolean {
	const read = normalizeLocalScheme(readPath);
	const target = normalizeLocalScheme(planTarget);
	return read === target || read.startsWith(`${target}:`);
}

/**
 * Build a compaction protection matcher that keeps `read` results for the active
 * plan file intact through prune/shake — the plan analog of skill-read
 * protection. Matches both the canonical `local://PLAN.md` alias and the
 * session's current plan reference path (the agent-chosen `local://<slug>-plan.md`),
 * so the plan survives compaction whether the agent reads it by alias or by name.
 *
 * `getPlanReferencePath` is evaluated at match time so the plan path set on
 * approval is honored immediately.
 */
export function createPlanReadMatcher(getPlanReferencePath: () => string): (context: ProtectedToolContext) => boolean {
	return (context: ProtectedToolContext) => {
		const path = getReadToolPath(context);
		if (path === undefined) return false;
		const normalized = normalizeLocalScheme(path);
		// Check stage files: extract basename, strip selector suffix.
		const slashIdx = normalized.lastIndexOf("/");
		const basename = slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized;
		if (STAGE_PATTERN.test(basename)) return true;
		return readTargetsPlan(path, LOCAL_PLAN_ALIAS) || readTargetsPlan(path, getPlanReferencePath());
	};
}
