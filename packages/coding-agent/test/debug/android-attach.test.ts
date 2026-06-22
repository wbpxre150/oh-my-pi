import { afterEach, describe, expect, it, spyOn, vi } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as adbModule from "../../src/dap/adb";
import { resolveAndroidAttach } from "../../src/dap/android";

function makeAndroidProject(applicationId: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-android-"));
	fs.mkdirSync(path.join(dir, "app"), { recursive: true });
	fs.writeFileSync(
		path.join(dir, "app", "build.gradle.kts"),
		`plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }\nandroid { defaultConfig { applicationId = "${applicationId}" } }\n`,
	);
	return dir;
}

function makeNonAndroidProject(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "omp-nonandroid-"));
}

const adbMock = (responses: Array<(args: string[]) => adbModule.AdbResult | Promise<adbModule.AdbResult>>) => {
	const calls: string[][] = [];
	const impl = (args: string[]): adbModule.AdbResult => {
		calls.push(args);
		const next = responses[calls.length - 1];
		const r = typeof next === "function" ? next(args) : next;
		// Allow sync returns; wrap if needed.
		return r as adbModule.AdbResult;
	};
	// Provide a calls accessor via closure on the returned mock function.
	const fn = (args: string[]) => Promise.resolve(impl(args));
	return { fn, getCalls: () => calls };
};

afterEach(() => {
	vi.restoreAllMocks();
});

describe("resolveAndroidAttach", () => {
	it("returns null for a non-Android project", async () => {
		const dir = makeNonAndroidProject();
		const spy = spyOn(adbModule, "adbExec").mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
		const result = await resolveAndroidAttach(dir);
		expect(result).toBeNull();
		expect(spy).not.toHaveBeenCalled();
	});

	it("returns a target with forward tcp:N jdwp:<pid> when app is running and debuggable", async () => {
		const dir = makeAndroidProject("com.test.app");
		const { fn, getCalls } = adbMock([
			// adb devices
			() => ({ exitCode: 0, stdout: "List of devices attached\n192.168.0.113:37815\tdevice\n", stderr: "" }),
			// run-as com.test.app id
			() => ({ exitCode: 0, stdout: "uid=10000\n", stderr: "" }),
			// pidof com.test.app (running)
			() => ({ exitCode: 0, stdout: "12345\n", stderr: "" }),
			// adb forward tcp:N jdwp:12345
			() => ({ exitCode: 0, stdout: `${0}`, stderr: "" }),
		]);
		spyOn(adbModule, "adbExec").mockImplementation(fn);
		const target = await resolveAndroidAttach(dir);
		expect(target).not.toBeNull();
		expect(target!.applicationId).toBe("com.test.app");
		expect(target!.host).toBe("127.0.0.1");
		expect(typeof target!.port).toBe("number");
		expect(target!.port).toBeGreaterThan(0);
		expect(target!.pid).toBe(12345);
		expect(target!.device).toBe("192.168.0.113:37815");
		expect(target!.projectRoot).toBe(dir);

		const calls = getCalls();
		const forwardCall = calls.find(a => a.includes("forward") && a.includes(`jdwp:12345`));
		expect(forwardCall).toBeDefined();
		expect(forwardCall![0]).toBe("-s");
		expect(forwardCall![1]).toBe("192.168.0.113:37815");

		await target!.cleanup();
		const removeCall = getCalls().find(a => a.includes("--remove") && a.includes(`tcp:${target!.port}`));
		expect(removeCall).toBeDefined();
	});

	it("auto-starts the app via monkey when pidof returns empty, then resolves the pid", async () => {
		const dir = makeAndroidProject("com.test.app");
		const { fn, getCalls } = adbMock([
			() => ({ exitCode: 0, stdout: "List of devices attached\nemulator-5554\tdevice\n", stderr: "" }),
			() => ({ exitCode: 0, stdout: "uid=10000\n", stderr: "" }),
			() => ({ exitCode: 0, stdout: "\n", stderr: "" }), // first pidof: empty
			() => ({ exitCode: 0, stdout: "", stderr: "" }), // monkey launch
			() => ({ exitCode: 0, stdout: "999\n", stderr: "" }), // second pidof: running
			() => ({ exitCode: 0, stdout: "", stderr: "" }), // forward
		]);
		spyOn(adbModule, "adbExec").mockImplementation(fn);
		const target = await resolveAndroidAttach(dir);
		expect(target).not.toBeNull();
		expect(target!.pid).toBe(999);
		const calls = getCalls();
		expect(calls.some(a => a.includes("monkey") && a.includes("com.test.app"))).toBe(true);
	});

	it("throws an actionable error when the app is not installed", async () => {
		const dir = makeAndroidProject("com.test.app");
		const { fn } = adbMock([
			() => ({ exitCode: 0, stdout: "List of devices attached\nemulator-5554\tdevice\n", stderr: "" }),
			() => ({ exitCode: 1, stdout: "", stderr: "run-as: unknown package: com.test.app\n" }),
		]);
		spyOn(adbModule, "adbExec").mockImplementation(fn);
		await expect(resolveAndroidAttach(dir)).rejects.toThrow(/not installed on device/);
	});

	it("throws when no device is connected", async () => {
		const dir = makeAndroidProject("com.test.app");
		const { fn } = adbMock([() => ({ exitCode: 0, stdout: "List of devices attached\n", stderr: "" })]);
		spyOn(adbModule, "adbExec").mockImplementation(fn);
		await expect(resolveAndroidAttach(dir)).rejects.toThrow(/No Android device connected/);
	});
});
