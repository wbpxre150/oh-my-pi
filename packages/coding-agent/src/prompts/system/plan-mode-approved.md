Plan approved.
{{#if contextPreserved}}
- Context preserved. Use conversation history when useful; this plan is the source of truth if it conflicts with earlier exploration.
{{/if}}

The approved stage files are persisted in the session's local:// root:

{{#each stageFiles}}
- Stage {{this.index}}: {{this.path}}
{{/each}}

{{#if localInferenceSlotLimit}}
IMPORTANT: The model server for this session runs with {{localInferenceSlotLimit}} parallel slot(s). You MUST spawn subagents one at a time (each `task` call must contain exactly 1 task). Do not batch multiple tasks in a single call.

{{/if}}
<instruction>
You MUST NOT read the stage files or execute any stage yourself. For each stage in order (sequentially), spawn a task subagent with a complete self-contained assignment that instructs the subagent to read the stage file at its local:// path and execute its instructions in full. The assignment must name the stage file path explicitly and include acceptance criteria. The files already exist on disk. Do NOT recreate or rewrite them.

The subagent's system prompt already contains the full plan content — do NOT repeat it in `context`. Use `context` only for shared background the plan does not cover (project conventions, environment quirks, shared constraints across stages). Each assignment MUST explicitly tell the subagent: (a) the stage file path to read, (b) to follow ALL instructions in the stage file including any `git commit` step after verification passes, and (c) the acceptance criteria.
{{#has tools "todo"}}
Before execution, initialize todo tracking with `todo`.
After each completed stage, immediately update `todo`.
If `todo` fails, fix the payload and retry before continuing.
{{/has}}
</instruction>

<critical>
You MUST keep going until complete. This matters.
</critical>
