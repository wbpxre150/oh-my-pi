import { describe, expect, it, vi } from "bun:test";
import { hookFetch } from "@oh-my-pi/pi-utils";
import { eraseSlot } from "../../src/task/local-inference-manager";

describe("eraseSlot", () => {
	it("POSTs to {baseUrl}/slots/{id}?action=erase and returns true", async () => {
		const fetchSpy = vi.fn(
			(_input: string | URL | Request, _init: RequestInit | undefined) => new Response("{}", { status: 200 }),
		);
		using _hook = hookFetch(fetchSpy);
		const result = await eraseSlot("http://localhost:8080", 2);
		expect(result).toBe(true);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url, init] = fetchSpy.mock.calls[0]!;
		expect(String(url)).toBe("http://localhost:8080/slots/2?action=erase");
		expect((init as RequestInit).method).toBe("POST");
	});

	it("strips the API path from the baseUrl (e.g. /v1)", async () => {
		const fetchSpy = vi.fn(
			(_input: string | URL | Request, _init: RequestInit | undefined) => new Response("{}", { status: 200 }),
		);
		using _hook = hookFetch(fetchSpy);
		// Real local-inference config has baseUrl like http://192.168.0.24:8081/v1
		// The /slots endpoint lives at the server root, not under /v1
		await eraseSlot("http://192.168.0.24:8081/v1", 0);
		expect(String(fetchSpy.mock.calls[0]![0])).toBe("http://192.168.0.24:8081/slots/0?action=erase");
	});

	it("does not throw on a non-2xx response", async () => {
		const fetchSpy = vi.fn(
			(_input: string | URL | Request, _init: RequestInit | undefined) => new Response("nope", { status: 500 }),
		);
		using _hook = hookFetch(fetchSpy);
		await expect(eraseSlot("http://localhost:8080", 1)).resolves.toBe(false);
	});

	it("does not throw on a network error", async () => {
		const fetchSpy = vi.fn((_input: string | URL | Request, _init: RequestInit | undefined) => {
			throw new Error("ECONNREFUSED");
		});
		using _hook = hookFetch(fetchSpy);
		await expect(eraseSlot("http://localhost:8080", 1)).resolves.toBe(false);
	});
});
