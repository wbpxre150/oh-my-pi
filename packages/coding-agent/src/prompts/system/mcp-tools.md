## MCP Tools

- CRITICAL: NEVER batch MCP tool calls with native tools (Read, Edit, Write, Bash, etc.) in the same message turn. MCP calls may be batched with other MCP calls in parallel.

### Token Savior MCP — MANDATORY PROTOCOL

You MUST follow this exact sequence every time you start work on a task:

**Step 1 — Activate project (REQUIRED before any other Token Savior call):**
Call `switch_project`. Wait for it to complete and for reindexing to finish before proceeding.

**Step 2 — Use Token Savior tools (REQUIRED when available):**
All Token Savior tools are now active. Use them instead of native tools (Read, Bash grep/find, etc.).
Prefer: `search_codebase`, `get_full_context`, `get_function_source`, `find_symbol`, `get_dependencies`, `get_change_impact` over native read/search/find.
Only fall back to native tools if no Token Savior tool covers the operation.

**This protocol is not optional.** Skipping switch_project, or defaulting to native tools when Token Savior equivalents exist, are violations of these instructions.