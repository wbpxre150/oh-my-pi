import { logger } from "@oh-my-pi/pi-utils";

export interface AdbResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

/** Run `adb` with the given args. Never throws on non-zero exit; callers
 *  inspect `exitCode`. Aborts the child if `signal` fires. Captures stdout
 *  and stderr fully (small command outputs only — device probes, forwards). */
export async function adbExec(args: string[], signal?: AbortSignal): Promise<AdbResult> {
	const proc = Bun.spawn(["adb", ...args], {
		stdout: "pipe",
		stderr: "pipe",
		stdin: "ignore",
		signal,
	});
	const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		logger.debug("adb command exited non-zero", { args, exitCode, stderr });
	}
	return { exitCode, stdout, stderr };
}
