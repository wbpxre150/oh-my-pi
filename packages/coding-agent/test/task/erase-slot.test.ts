import { describe, expect, it, vi } from "bun:test";
import { hookFetch } from "@oh-my-pi/pi-utils";
import { eraseSlot } from "../../src/task/local-inference-manager";

describe("eraseSlot", () => {
	it("POSTs to {baseUrl}/slots/{id}?action=erase", async () => {
		const fetchSpy = vi.fn(() => new Response("{}", { status: 200 }));
		using _hook = hookFetch(fetchSpy);
		await eraseSlot("http://localhost:8080", 2);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url, init] = fetchSpy.mock.calls[0]!;
		expect(String(url)).toBe("http://localhost:8080/slots/2?action=erase");
		expect((init as RequestInit).method).toBe("POST");
	});

	it("strips a trailing slash from the baseUrl", async () => {
		const fetchSpy = vi.fn(() => new Response("{}", { status: 200 }));
		using _hook = hookFetch(fetchSpy);
		await eraseSlot("http://localhost:8080/", 0);
		expect(String(fetchSpy.mock.calls[0]![0])).toBe("http://localhost:8080/slots/0?action=erase");
	});

	it("does not throw on a non-2xx response", async () => {
		const fetchSpy = vi.fn(() => new Response("nope", { status: 500 }));
		using _hook = hookFetch(fetchSpy);
		await expect(eraseSlot("http://localhost:8080", 1)).resolves.toBeUndefined();
	});

	it("does not throw on a network error", async () => {
		const fetchSpy = vi.fn(() => {
			throw new Error("ECONNREFUSED");
		});
		using _hook = hookFetch(fetchSpy);
		await expect(eraseSlot("http://localhost:8080", 1)).resolves.toBeUndefined();
	});
});
