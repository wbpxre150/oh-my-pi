Plan approved.
{{#if contextPreserved}}
- Context preserved. Use conversation history when useful; this plan is the source of truth if it conflicts with earlier exploration.
{{/if}}

The approved stage files are persisted in the session's local:// root:

{{#each stageFiles}}
- Stage {{this.index}}: {{this.path}}
{{/each}}

<instruction>
Execute the stages sequentially. For each stage in order: read its local:// file, then spawn a task subagent and pass that stage file path in the assignment. The files already exist on disk. Do NOT recreate or rewrite them.
{{#has tools "todo"}}
Before execution, initialize todo tracking with `todo`.
After each completed stage, immediately update `todo`.
If `todo` fails, fix the payload and retry before continuing.
{{/has}}
</instruction>

<critical>
You MUST keep going until complete. This matters.
</critical>
