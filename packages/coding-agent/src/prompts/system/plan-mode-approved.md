Plan approved.
{{#if contextPreserved}}
- Context preserved. Use conversation history when useful; this plan is the source of truth if it conflicts with earlier exploration.
{{/if}}

The approved stage files are persisted in the session's local:// root:

{{#each stageFiles}}
- Stage {{this.index}}: {{this.path}}
{{/each}}

<instruction>
You MUST NOT read the stage files or execute any stage yourself. For each stage in order, spawn a task subagent with a complete self-contained assignment that instructs the subagent to read the stage file at its local:// path and execute its instructions in full. The assignment must name the stage file path explicitly and include acceptance criteria. The files already exist on disk. Do NOT recreate or rewrite them.
{{#has tools "todo"}}
Before execution, initialize todo tracking with `todo`.
After each completed stage, immediately update `todo`.
If `todo` fails, fix the payload and retry before continuing.
{{/has}}
</instruction>

<critical>
You MUST keep going until complete. This matters.
</critical>
