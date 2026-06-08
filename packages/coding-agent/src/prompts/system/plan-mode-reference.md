## Existing Plan

{{#each stageFiles}}
### Stage {{this.index}}: {{this.path}}
<stage path="{{this.path}}">
{{this.content}}
</stage>
{{/each}}

<instruction>
If this plan is relevant to current work and not complete, you MUST continue executing it.
If the plan is stale or unrelated, you MUST ignore it.
The stage file paths are for subagent handoff. Read them before executing.
</instruction>
