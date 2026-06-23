import { afterEach, describe, expect, it } from "bun:test";
import type { Context, Model, StreamOptions } from "../src/types";
import { streamOpenAICompletions } from "../src/providers/openai-completions";
import { UNK_MAX_TOKENS } from "../src/provider-models/openai-compat";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

function sseResponse(chunks: unknown[]): Response {
  const body = chunks.map(c => `data: ${JSON.stringify(c)}`).join("\n") + "\ndata: [DONE]\n\n";
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function makeModel(overrides: Partial<Model<"openai-completions">> = {}): Model<"openai-completions"> {
  return {
    id: "test-model",
    name: "Test Model",
    provider: "test",
    api: "openai-completions",
    baseUrl: "https://test.example.com/v1",
    contextWindow: 128000,
    maxTokens: 16384,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    ...overrides,
  } as Model<"openai-completions">;
}

const baseContext: Context = {
  systemPrompt: [],
  messages: [{ role: "user", content: "ping", timestamp: Date.now() }],
};

async function captureMaxTokens(model: Model<"openai-completions">, options?: Partial<StreamOptions>): Promise<number | undefined> {
  let capturedBody: string | null = null;
  global.fetch = (async (_input: unknown, init?: RequestInit) => {
    capturedBody = typeof init?.body === "string" ? init.body : null;
    return sseResponse([
      { choices: [{ delta: { content: "ok" }, index: 0 }] },
      { choices: [{ delta: {}, finish_reason: "stop", index: 0 }] },
    ]);
  }) as typeof global.fetch;

  const stream = streamOpenAICompletions(model, baseContext, { apiKey: "test", ...options });
  for await (const _event of stream) {
    /* drain */
  }

  const parsed = JSON.parse(capturedBody ?? "{}") as { max_tokens?: number; max_completion_tokens?: number };
  return parsed.max_tokens ?? parsed.max_completion_tokens;
}

describe("openai-completions effectiveMaxTokens", () => {
  it("sends model.maxTokens when caller omits maxTokens", async () => {
    const model = makeModel({ maxTokens: 65536 });
    const result = await captureMaxTokens(model);
    expect(result).toBe(65536);
  });

  it("does not send max_tokens when model.maxTokens is UNK_MAX_TOKENS sentinel", async () => {
    const model = makeModel({ maxTokens: UNK_MAX_TOKENS });
    const result = await captureMaxTokens(model);
    expect(result).toBeUndefined();
  });

  it("prefers caller-provided maxTokens over model.maxTokens", async () => {
    const model = makeModel({ maxTokens: 65536 });
    const result = await captureMaxTokens(model, { maxTokens: 4096 });
    expect(result).toBe(4096);
  });

  it("does not send max_tokens when omitMaxOutputTokens is true", async () => {
    const model = makeModel({ maxTokens: 65536, omitMaxOutputTokens: true });
    const result = await captureMaxTokens(model);
    expect(result).toBeUndefined();
  });
});
