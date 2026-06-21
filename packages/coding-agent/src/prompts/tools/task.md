Launches subagents to parallelize workflows.

{{#if asyncEnabled}}
- Results are delivered automatically when complete.
- The tool result lists the assigned task ids (e.g. `AuthLoader`) — those are the live agent ids.
{{#if ircEnabled}}
- Coordinate with running tasks via `irc` using those ids. `job cancel` terminates a task and **cannot carry a message** — only use it for stalled/abandoned work.
- If genuinely blocked on completion, wait with `job poll`; otherwise keep working.
{{else}}
- If genuinely blocked on completion, wait with `job poll`; otherwise keep working.
- Use `job list` to snapshot manager state; `cancel: [id]` only to actually stop a stuck task.
{{/if}}
{{/if}}

{{#if ircEnabled}}
Subagents have no conversation history, but they can reach you and their siblings live via the `irc` tool. Front-load every fact, file path, and direction they need in {{#if contextEnabled}}`context` or `assignment`{{else}}each `assignment`{{/if}}.
{{else}}
Subagents have no conversation history. Every fact, file path, and direction they need MUST be explicit in {{#if contextEnabled}}`context` or `assignment`{{else}}each `assignment`{{/if}}.
{{/if}}

<parameters>
- `agent`: agent type for all tasks
- `tasks`: tasks to execute in parallel
 - `.id`: CamelCase, ≤32 chars
 - `.description`: UI label only — subagent never sees it
 - `.assignment`: complete self-contained instructions; one-liners and missing acceptance criteria are PROHIBITED
{{#if contextEnabled}}- `context`: shared background prepended to every assignment; session-specific only{{/if}}
{{#if customSchemaEnabled}}- `schema`: JTD schema for expected structured output (do not put format rules in assignments){{/if}}
{{#if isolationEnabled}}- `isolated`: run in isolated env; use when tasks edit overlapping files{{/if}}
</parameters>

<rules>
- **Maximize batch width within limits.** Spawn up to {{MAX_CONCURRENCY}} tasks per batch. NEVER spawn a single-task batch for divisible work, or defer work that could have been concurrent.
- NEVER assign tasks to run project-wide build/test/lint. Caller verifies after the batch.
- **Subagents do not verify, lint, or format.** Every assignment MUST instruct the subagent to skip all gates and formatters. You run them once at the end across the union of changed files — avoids redundant runs and racing formatter passes.
- No globs, no "update all", no package-wide scope. Fan out.
- Do not concern yourself with how agents might overlap on certain actions. Never use it as an excuse to go slower: they can resolve collisions in real-time with the harness facilities.
- Pass large payloads via `local://<path>` URIs, not inline. {{#if contextEnabled}} (other than the context){{/if}}
{{#if contextEnabled}}- Put shared constraints in `context` once; do not duplicate across assignments.{{/if}}
- Prefer agents that investigate **and** edit in one pass; only spin a read-only discovery step when affected files are genuinely unknown.
- **Read-only agents**: Agents tagged READ-ONLY (e.g. `explore`) have no edit/write/command tools. NEVER hand them an assignment that requires changing files or running commands — they cannot do it and the turn is wasted. Use them to investigate and report back; do the edits yourself or delegate to a writing agent (`task`, `oracle`, `designer`).
- **No reasoning offload**: NEVER offload reasoning, analysis, design, or decision-making to `quick_task` or `explore` — they run minimal-effort / small models for mechanical lookups and data collection only. Keep judgment and synthesis in your own context; delegate hard thinking to `task`, `plan`, or `oracle`.
{{#if EXPLORE_LIMIT}}- **Explore batch limit**: The `explore` agent uses local inference and is limited to {{EXPLORE_LIMIT}} parallel slot(s). Batch at most {{EXPLORE_LIMIT}} explore tasks per call.{{/if}}
</rules>

<parallelization>
{{#if ircEnabled}}
Test: can task B run correctly without seeing A's output? If no, sequence A → B — **unless** B can reasonably ask A for the missing piece over `irc`. Live coordination beats a serial waterfall when the contract is small and easy to describe in a DM.
Still sequence when one task produces a large, evolving contract (generated types, schema migration, core module API) the other consumes wholesale — IRC round-trips do not replace a finished artifact.
Parallel when tasks touch disjoint files, are independent refactors/tests, or only need occasional clarification that can be resolved peer-to-peer.
{{else}}
Test: can task B run correctly without seeing A's output? If no, sequence A → B.
Sequential when one task produces a contract (types, API, schema, core module) the other consumes.
Parallel when tasks touch disjoint files or are independent refactors/tests.
{{/if}}
</parallelization>

{{#if contextEnabled}}
<context-fmt>
# Goal         ← one sentence: what the batch accomplishes
# Constraints  ← MUST/NEVER rules and session decisions
# Contract     ← exact types/signatures if tasks share an interface
</context-fmt>
{{/if}}

<assignment-fmt>
# Target       ← exact files and symbols; explicit non-goals
# Change       ← step-by-step add/remove/rename; APIs and patterns
# Acceptance   ← observable result; no project-wide commands
</assignment-fmt>

<agents>
{{#if spawningDisabled}}
Agent spawning is disabled for this context.
{{else}}
{{#list agents join="\n"}}
# {{name}}{{#if readOnly}} — READ-ONLY (no edit/write/exec tools){{/if}}
{{description}}
{{/list}}
{{/if}}
</agents>
