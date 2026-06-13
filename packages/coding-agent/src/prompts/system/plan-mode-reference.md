## Existing Plan

The stage files for this plan are persisted in the session's local:// root:

{{#each stageFiles}}
- Stage {{this.index}}: {{this.path}}
{{/each}}

<instruction>
If this plan is relevant to current work and not complete, you MUST continue executing it.
If the plan is stale or unrelated, you MUST ignore it.
Read each stage file from its local:// path before executing; pass the path to a subagent for handoff. The files already exist on disk. Do NOT recreate or rewrite them.
</instruction>
