## MCP Tools

- CRITICAL: NEVER batch MCP tool calls with other tools. Each MCP call must be alone in its own message turn.

### Token Savior MCP — MANDATORY PROTOCOL

You MUST follow this exact sequence every time you start work on a task:

**Step 1 — Activate the full Token Savior tool set (REQUIRED first, before any other action):**
Call `search_tool_bm25` with query `"token savior"` and `limit: 50`. The BM25 index scores all Token Savior MCP tools highly against the server name, so this single call activates all ~40 tools at once. Do NOT proceed to any other tool — native or MCP — before this call completes.

**Step 2 — Activate project (REQUIRED before any other Token Savior call):**
Call `switch_project` (now activated). Wait for it to complete and for reindexing to finish before proceeding.

**Step 3 — Use Token Savior tools (REQUIRED when available):**
All Token Savior tools are now active. Use them instead of native tools (Read, Bash grep/find, etc.).
Prefer: `search_codebase`, `get_full_context`, `get_function_source`, `find_symbol`, `get_dependencies`, `get_change_impact` over native read/search/find.
Only fall back to native tools if no Token Savior tool covers the operation.

**This protocol is not optional.** Skipping `search_tool_bm25`, skipping `switch_project`, or defaulting to native tools when Token Savior equivalents exist are all violations of these instructions.
