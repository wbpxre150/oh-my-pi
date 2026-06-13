import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { LocalProtocolOptions } from "@oh-my-pi/pi-coding-agent/internal-urls";
import { loadOverallPlanReference, loadStagePlanReferences } from "@oh-my-pi/pi-coding-agent/plan-mode/plan-handoff";

describe("loadOverallPlanReference", () => {
	let tmpDir: string;
	let artifactsDir: string;
	let localProtocolOptions: LocalProtocolOptions;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "plan-handoff-"));
		artifactsDir = path.join(tmpDir, "artifacts");
		await fs.mkdir(path.join(artifactsDir, "local"), { recursive: true });
		localProtocolOptions = {
			getArtifactsDir: () => artifactsDir,
			getSessionId: () => "session-z",
		};
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it("returns the plan path and full contents when the reference file exists", async () => {
		const body = "# WP migration\n\n1. Migrate the store\n2. Update callers";
		await Bun.write(path.join(artifactsDir, "local", "wp-migration.md"), body);

		const ref = await loadOverallPlanReference("local://wp-migration.md", localProtocolOptions);

		expect(ref).toEqual({ path: "local://wp-migration.md", content: body });
	});

	it("returns undefined when no plan file exists at the reference path", async () => {
		const ref = await loadOverallPlanReference("local://PLAN.md", localProtocolOptions);

		expect(ref).toBeUndefined();
	});

	it("returns undefined when the plan file is empty or whitespace-only", async () => {
		await Bun.write(path.join(artifactsDir, "local", "PLAN.md"), "   \n\t\n");

		const ref = await loadOverallPlanReference("local://PLAN.md", localProtocolOptions);

		expect(ref).toBeUndefined();
	});
});

describe("loadStagePlanReferences", () => {
	let tmpDir: string;
	let artifactsDir: string;
	let localProtocolOptions: LocalProtocolOptions;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "plan-handoff-"));
		artifactsDir = path.join(tmpDir, "artifacts");
		await fs.mkdir(path.join(artifactsDir, "local"), { recursive: true });
		localProtocolOptions = {
			getArtifactsDir: () => artifactsDir,
			getSessionId: () => "session-z",
		};
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it("orders stage files numerically, not lexically", async () => {
		const localDir = path.join(artifactsDir, "local");
		for (const n of [1, 2, 10, 11]) {
			await Bun.write(path.join(localDir, `stage-${n}.md`), `# Stage ${n}\n\nwork`);
		}

		const stages = await loadStagePlanReferences(localProtocolOptions);

		expect(stages?.map(s => s.path)).toEqual([
			"local://stage-1.md",
			"local://stage-2.md",
			"local://stage-10.md",
			"local://stage-11.md",
		]);
	});

	it("skips empty stage files and returns undefined when none have content", async () => {
		const localDir = path.join(artifactsDir, "local");
		await Bun.write(path.join(localDir, "stage-1.md"), "   \n\t\n");
		await Bun.write(path.join(localDir, "stage-2.md"), "# Stage 2\n\nreal work");

		const stages = await loadStagePlanReferences(localProtocolOptions);
		expect(stages?.map(s => s.path)).toEqual(["local://stage-2.md"]);

		await fs.rm(path.join(localDir, "stage-2.md"));
		await Bun.write(path.join(localDir, "stage-2.md"), "\n");
		expect(await loadStagePlanReferences(localProtocolOptions)).toBeUndefined();
	});
});
