Plan approved.
{{#if contextPreserved}}
- Context preserved. Use conversation history when useful; this plan is the source of truth if it conflicts with earlier exploration.
{{/if}}

Stage files approved:

{{#each stageFiles}}
### Stage {{this.index}}: {{this.path}}
<stage path="{{this.path}}">
{{this.content}}
</stage>
{{/each}}

<instruction>
You MUST read these stage files and execute them sequentially via task subagents.
For each stage, spawn a subagent and pass the stage file path in the assignment.
{{#has tools "todo"}}
Before execution, initialize todo tracking with `todo`.
After each completed stage, immediately update `todo`.
If `todo` fails, fix the payload and retry before continuing.
{{/has}}
</instruction>

<critical>
You MUST keep going until complete. This matters.
</critical>
