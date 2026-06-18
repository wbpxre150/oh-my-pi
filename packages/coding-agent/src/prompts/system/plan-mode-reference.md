## Existing Plan

The stage files for this plan are persisted in the session's local:// root:

{{#each stageFiles}}
- Stage {{this.index}}: {{this.path}}
{{/each}}

<instruction>
If this plan is relevant to current work and not complete, you MUST continue executing it.
If the plan is stale or unrelated, you MUST ignore it.
You MUST NOT read the stage files or execute stages yourself. For each stage, spawn a task subagent with a complete self-contained assignment that instructs the subagent to read the stage file at its local:// path and execute its instructions in full. The assignment must name the stage file path explicitly and include acceptance criteria. The files already exist on disk. Do NOT recreate or rewrite them.

The subagent's system prompt already contains the full plan content — do NOT repeat it in `context`. Use `context` only for shared background the plan does not cover (project conventions, environment quirks, shared constraints across stages). Each assignment MUST explicitly tell the subagent: (a) the stage file path to read, (b) to follow ALL instructions in the stage file including any `git commit` step after verification passes, and (c) the acceptance criteria.
</instruction>
