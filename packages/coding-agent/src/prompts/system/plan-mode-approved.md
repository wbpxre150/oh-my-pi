Plan approved.
{{#if contextPreserved}}
- Context preserved. Use conversation history when useful; this plan is the source of truth if it conflicts with earlier exploration.
{{/if}}

The approved stage files are persisted in the session's local:// root:

{{#each stageFiles}}
- Stage {{this.index}}: {{this.path}}
{{/each}}
These are ALL the stage files for this plan. Do not search for or expect any additional stage files beyond this list.

{{#if localInferenceSlotLimit}}
IMPORTANT: The model server for this session runs with {{localInferenceSlotLimit}} parallel slot(s). You MUST spawn subagents one at a time (each `task` call must contain exactly 1 task). Do not batch multiple tasks in a single call.

{{/if}}
<critical>
You MUST NOT read the stage files. You MUST NOT read any source files or explore the codebase. You MUST NOT execute any stage work yourself. Your ONLY job is to spawn task subagents — one per stage, in order — and wait for each to complete before spawning the next.
</critical>

<instruction>
For each stage in order (sequentially, one at a time), spawn a task subagent whose assignment:
- Names the stage file path explicitly (from the list above) and tells the subagent to read it and execute ALL instructions in it in full, including any `git commit` step after verification passes.
- States the acceptance criteria for that stage.
- In `context`: include only the contents of AGENTS.md (already in your conversation context — copy it verbatim, do not re-read it). Do not explore the codebase or read any other files to build context. The stage file and AGENTS.md are all the subagent needs.

The files already exist on disk. Do NOT recreate or rewrite them.
{{#has tools "todo"}}
Before execution, initialize todo tracking with `todo`.
After each completed stage, immediately update `todo`.
If `todo` fails, fix the payload and retry before continuing.
{{/has}}
</instruction>

<critical>
You MUST keep going until all stages are complete. This matters.
</critical>
