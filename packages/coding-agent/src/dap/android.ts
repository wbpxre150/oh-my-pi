import * as fs from "node:fs/promises";
import * as path from "node:path";
import { isEnoent, logger } from "@oh-my-pi/pi-utils";
import * as adb from "./adb";

export interface AndroidAttachTarget {
	host: string;
	port: number;
	projectRoot: string;
	applicationId: string;
	projectName: string;
	pid: number;
	device: string;
	/** Remove the `adb forward tcp:<port> jdwp:<pid>` created for this target.
	 *  Best-effort; never throws. Registered as the session `onDispose` hook. */
	cleanup: () => Promise<void>;
}

const APP_ID_RE = /applicationId\s*=\s*"([^"]+)"/;
const PIDOF_POLL_INTERVAL_MS = 300;
const PIDOF_POLL_ATTEMPTS = 12; // ~3.6s after auto-start

async function findApplicationModule(projectRoot: string): Promise<{ gradleText: string; projectName: string } | null> {
	// Build candidate module directories: conventional `app/` first, then
	// other immediate subdirectories, then a root-level module.
	const moduleDirs: string[] = ["app"];
	try {
		for (const entry of await fs.readdir(projectRoot, { withFileTypes: true })) {
			if (entry.isDirectory() && entry.name !== "app" && !entry.name.startsWith(".")) {
				moduleDirs.push(entry.name);
			}
		}
	} catch (error) {
		if (!isEnoent(error)) throw error;
	}
	moduleDirs.push("."); // root-level module
	for (const dir of moduleDirs) {
		for (const name of ["build.gradle.kts", "build.gradle"]) {
			const rel = dir === "." ? name : `${dir}/${name}`;
			const candidate = path.join(projectRoot, rel);
			let text: string;
			try {
				text = await Bun.file(candidate).text();
			} catch (error) {
				if (isEnoent(error)) continue;
				throw error;
			}
			if (APP_ID_RE.test(text)) {
				const projectName = dir === "." ? path.basename(projectRoot) : dir;
				return { gradleText: text, projectName };
			}
		}
	}
	return null;
}

/** Parse `adb devices` output. Returns the first serial whose state is
 *  `device`, or throws with the obstructing state if only offline/unauthorized
 *  devices are present, or null if no devices are listed. */
function pickOnlineDevice(devicesStdout: string): string | null {
	const lines = devicesStdout.split("\n").slice(1); // drop "List of devices attached"
	let obstructing: string | null = null;
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const parts = trimmed.split(/\s+/);
		if (parts.length < 2) continue;
		const [serial, state] = parts;
		if (state === "device") return serial;
		if (state === "offline" || state === "unauthorized") obstructing = `${serial} (${state})`;
	}
	return obstructing; // null when truly empty, or the obstructing label
}

async function reserveLocalPort(): Promise<number> {
	const server = Bun.listen({
		hostname: "127.0.0.1",
		port: 0,
		socket: {
			open() {},
			data() {},
			close() {},
			error() {},
		},
	});
	const port = server.port;
	server.stop();
	return port;
}

/**
 * Resolve an Android attach target for the given project root.
 *
 * Returns `null` when `cwd` is not an Android-Kotlin project (no
 * `app/build.gradle(.kts)` with an `applicationId`). Returns a target when a
 * device is connected and the app is installed, debuggable, and running (or
 * auto-startable). Throws with an actionable message for blocked Android
 * projects (no device, app not installed, not debuggable, won't start,
 * forward fails, adb missing).
 */
export async function resolveAndroidAttach(cwd: string, signal?: AbortSignal): Promise<AndroidAttachTarget | null> {
	const module = await findApplicationModule(cwd);
	if (!module) return null;
	const appIdMatch = APP_ID_RE.exec(module.gradleText);
	if (!appIdMatch) return null;
	const applicationId = appIdMatch[1];
	const projectName = module.projectName;

	if (!Bun.which("adb")) {
		throw new Error(
			`Android project detected (applicationId ${applicationId}) but 'adb' is not on PATH. Install Android platform-tools and retry.`,
		);
	}

	const devicesRes = await adb.adbExec(["devices"], signal);
	if (devicesRes.exitCode !== 0) {
		throw new Error(`adb devices failed: ${devicesRes.stderr || devicesRes.stdout}`);
	}
	const device = pickOnlineDevice(devicesRes.stdout);
	if (!device) {
		throw new Error("No Android device connected. Run `adb devices` and authorize the device, then retry.");
	}
	if (device.includes("(")) {
		throw new Error(`Android device is ${device}. Authorize/enable USB debugging on the device, then retry.`);
	}

	// run-as succeeds only for installed debuggable apps.
	const runAsRes = await adb.adbExec(["-s", device, "shell", "run-as", applicationId, "id"], signal);
	if (runAsRes.exitCode !== 0) {
		const err = `${runAsRes.stderr} ${runAsRes.stdout}`.toLowerCase();
		if (err.includes("unknown package") || err.includes("not installed")) {
			throw new Error(
				`App ${applicationId} is not installed on device ${device}. Install a debug build: \`./gradlew installDebug\` or \`adb -s ${device} install app/build/outputs/apk/debug/app-debug.apk\`.`,
			);
		}
		throw new Error(
			`App ${applicationId} is not debuggable on device ${device} (run-as failed: ${runAsRes.stderr.trim()}). Install a debug build.`,
		);
	}

	// Resolve PID, auto-starting via monkey if not running.
	let pidText = (await adb.adbExec(["-s", device, "shell", "pidof", applicationId], signal)).stdout.trim();
	if (!pidText) {
		logger.info("Android app not running; auto-starting", { applicationId, device });
		await adb.adbExec(
			["-s", device, "shell", "monkey", "-p", applicationId, "-c", "android.intent.category.LAUNCHER", "1"],
			signal,
		);
		for (let i = 0; i < PIDOF_POLL_ATTEMPTS; i += 1) {
			await Bun.sleep(PIDOF_POLL_INTERVAL_MS);
			pidText = (await adb.adbExec(["-s", device, "shell", "pidof", applicationId], signal)).stdout.trim();
			if (pidText) break;
		}
	}
	const pid = Number.parseInt(pidText, 10);
	if (!Number.isFinite(pid) || pid <= 0) {
		throw new Error(
			`Could not start ${applicationId} on device ${device}. Launch the app manually on the device and retry.`,
		);
	}

	// Reserve a free localhost port and forward it to the device-side JDWP.
	const port = await reserveLocalPort();
	const forwardRes = await adb.adbExec(["-s", device, "forward", `tcp:${port}`, `jdwp:${pid}`], signal);
	if (forwardRes.exitCode !== 0) {
		// Retry once: the reserved port may have been taken between stop() and adb bind.
		const retryPort = await reserveLocalPort();
		const retryRes = await adb.adbExec(["-s", device, "forward", `tcp:${retryPort}`, `jdwp:${pid}`], signal);
		if (retryRes.exitCode !== 0) {
			throw new Error(`adb forward failed: ${retryRes.stderr || retryRes.stdout || "unknown error"}`);
		}
		return buildTarget(retryPort, pid, device, applicationId, projectName, cwd);
	}
	return buildTarget(port, pid, device, applicationId, projectName, cwd);
}

function buildTarget(
	port: number,
	pid: number,
	device: string,
	applicationId: string,
	projectName: string,
	projectRoot: string,
): AndroidAttachTarget {
	return {
		host: "127.0.0.1",
		port,
		projectRoot,
		applicationId,
		projectName,
		pid,
		device,
		cleanup: async () => {
			try {
				await adb.adbExec(["-s", device, "forward", "--remove", `tcp:${port}`]);
			} catch (error) {
				logger.warn("adb forward --remove failed", { port, error: String(error) });
			}
		},
	};
}
