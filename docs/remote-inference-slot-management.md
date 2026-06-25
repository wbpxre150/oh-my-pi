# Remote Inference Slot Management

When running subagents against a remote llama.cpp server (or compatible backend), the TaskTool
dynamically manages server slot count and caps subagent concurrency to match available slots.
This prevents overload errors (e.g. "no slot available") during parallel subagent execution.

## When It Applies

Slot management activates when both conditions hold:

1. **Provider marked for control** — a provider in `models.yml` has
   `localInferenceControl: true` and a non-empty `baseUrl`.
2. **Model override matches** — the agent's model override (from
   `task.agentModelOverrides` in settings, or the session model override) includes a
   pattern starting with that provider's key + `"/"`, e.g. `llama.cpp/qwen35...`.

If no provider is flagged or no pattern matches, slot management is a no-op.

## Configuration

### `~/.omp/agent/local-inference.yml`

Loaded as a singleton `ConfigFile` at `packages/coding-agent/src/config/local-inference-config.ts`
with the full schema below.

```yaml
# SSH connection for remote server control
ssh:
  # user@host string, e.g. "adam@192.168.0.24"
  host: "adam@192.168.0.24"
  # Path to the restart script on the remote host.
  # Called as: ssh <host> "<restartScript> <slots>"
  # The remote shell expands ~ so "~/ai.sh" works.
  restartScript: "~/ai.sh"

# Health-check endpoint polling
healthCheckUrl: "http://192.168.0.24:8080/health"   # optional; derived from provider baseUrl + /health if omitted
healthCheck:
  timeoutMs: 30000          # how long to wait for server readiness after restart
  pollIntervalMs: 500        # how often to poll the health endpoint

# Per-agent-type slot limits / concurrency cap
agentConcurrency:
  explore: 2                 # max parallel slots for the explore agent
  task: 1                    # max parallel slots for all other agents (default: 1)

# Per-agent-type model tier passed to restart script (second arg)
modelTier:
  explore: "f"               # fast 35B model for the explore agent
  task: "s"                  # slow 27B model for task and other agents
```

All optional fields have sensible defaults. The only required setting to make the feature
operational is `ssh.host` — without it, `ensureLocalInferenceSlots` throws at runtime.

### `models.yml` provider flag

Add `localInferenceControl: true` to a provider entry:

```yaml
providers:
  llama.cpp:
    baseUrl: "http://192.168.0.24:8080"
    localInferenceControl: true
    # ... other provider settings
```

### `task.agentModelOverrides` (settings)

Agents must route to a model on the controlled provider. In `config.yml`:

```yaml
task:
  agentModelOverrides:
    explore: "llama.cpp/qwen3-1.7b"
    task: "llama.cpp/qwen3-1.7b"
```

The prefix before `"/"` must match a provider key with `localInferenceControl: true`.

## How It Works

### Flow (sync path — `#executeSync`)

1. Immediately before running a batch of subagents, `TaskTool` calls
   `resolveLocalInferenceProvider` to check whether any controlled provider matches the
   current model override.
2. If matched, `LocalInferenceConfigFile.tryLoad()` loads `~/.omp/agent/local-inference.yml`.
3. Effective concurrency is computed: `Math.min(task.maxConcurrency, agentConcurrency[agentName])`.
4. Desired slots: `Math.min(taskCount, effectiveConcurrency)`.
5. `ensureLocalInferenceSlots(...)` (in `local-inference-manager.ts`) takes over:
   - Reads persistent state from `~/.omp/agent/.local-inference-state.json`.
   - Skips the restart if the server is already running with the correct slot count and
     model tier (`shouldRestart` check).
   - If restart is needed: SSHes into the remote host and runs the configured
     `restartScript` with the desired slot count as the first argument and the model
     tier (`f` for fast 35B, `s` for slow 27B) as the second argument. A tier change
     forces a server restart even when the slot count is unchanged.
   - Polls the health endpoint (`<providerBaseUrl>/health` or explicit `healthCheckUrl`)
     until the server responds or the timeout expires.
   - Writes the new slot count and tier to the state file.
6. Subagents are dispatched through `mapWithConcurrencyLimit` capped at
   `effectiveMaxConcurrency`.

### Async path

The async path applies the same concurrency cap (step 3) and serializes the semaphore
acquisition, but does **not** SSH-restart per async job — slot management runs once in the
sync execution that schedules the async jobs.

### Serialization

Calls to `ensureLocalInferenceSlots` are serialized through a module-level promise chain.
Concurrent TaskTool invocations (across different agents or user-triggered calls) do not
race: only one SSH restart runs at a time, and `shouldRestart` short-circuits the second
call when the desired slot count matches what the first call already set.

### State file

`~/.omp/agent/.local-inference-state.json`:

```json
{ "currentSlots": 4, "tier": "f", "providerBaseUrl": "http://192.168.0.24:8080" }
```

Used to avoid unnecessary restarts. Starts with `currentSlots: null` on fresh state (first
run always restarts).
## Slot KV-cache Erase

After each subagent completes (success, failure, or abort) the TaskTool POSTs
`{providerBaseUrl}/slots/{slotId}?action=erase` to wipe that slot's KV cache and context
checkpoints. Without this, accumulated per-slot checkpoints exhaust system RAM and crash
the server.

Each concurrent subagent is pinned to a deterministic slot index `0..N-1` (where N is the
slot count returned by `ensureLocalInferenceSlots`), so the correct slot is erased and
parallel explore agents never share a slot. The pinning is threaded into every completion
request as `id_slot: <index>` via an `AsyncLocalStorage` scope set by the executor
(`runWithSlotId` in `@oh-my-pi/pi-ai`).

- Task agents: N=1, slot 0; erased after each task.
- Explore agents: N = `agentConcurrency.explore`; each agent erases its own index.
- The erase call is best-effort (logged, never throws), so a dead server or network error
  cannot poison the subagent result or block the slot pool.

Source: `eraseSlot` in `packages/coding-agent/src/task/local-inference-manager.ts`; the
slot pool and per-agent `finally` in `packages/coding-agent/src/task/index.ts`
(`#executeSync`); the ALS channel in `packages/ai/src/providers/openai-completions.ts`.

## Per-Agent Slot Limits

| Agent type | Config key       | Recommended default | Rationale                                  |
| ---------- | ---------------- | ------------------- | ------------------------------------------ |
| `explore`  | `explore`        | 2                   | Lightweight read-only probes; more slots useful |
| (others)   | `task`           | 1                   | Full-context subagents; one slot maximises context per task |

The `explore` limit is configured separately because explore agents are lightweight
(read-only, short-lived) and benefit from higher parallelism, while task agents hold full
conversation contexts and typically should run one at a time.

## Per-Agent Model Tier

The restart script is invoked as `~/ai.sh <slots> <tier>` where `tier` is `f` for the
fast 35B model or `s` for the slow 27B model. The tier is resolved from `modelTier` in
`~/.omp/agent/local-inference.yml` based on agent type:

| Agent type | Tier | Model             |
| ---------- | ---- | ----------------- |
| `explore`  | `f`  | Fast 35B model    |
| (others)   | `s`  | Slow 27B model    |

A tier change forces a server restart even when the slot count is unchanged, because
swapping models requires a restart. The tier is persisted in `.local-inference-state.json`
alongside the slot count.

## Concurrency Cap

The effective concurrency is always `Math.min(task.maxConcurrency, slotLimit)`. If
`task.maxConcurrency` is 8 but `agentConcurrency.explore` is 2, the explore batch runs at
most 2 concurrent subagents.

## Source

- `packages/coding-agent/src/config/local-inference-config.ts` — schema and config file loader.
- `packages/coding-agent/src/config/models-config-schema.ts` — `localInferenceControl` field on
  `ProviderConfigSchema`.
- `packages/coding-agent/src/task/local-inference-manager.ts` — SSH restart, health polling,
  state persistence, serialization.
- `packages/coding-agent/src/task/index.ts` — `resolveLocalInferenceProvider` and integration
  into both async and sync execution paths.