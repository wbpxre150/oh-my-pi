## MCP Tools

- CRITICAL: NEVER batch MCP tool calls with other tools. Each MCP call must be alone in its own message turn.

### Token Savior MCP — MANDATORY PROTOCOL

You MUST follow this exact sequence every time you start work on a task:

**Step 1 — Activate project (REQUIRED before any other Token Savior call):**
Call `switch_project`. Wait for it to complete and for reindexing to finish before proceeding.

**Step 2 — Use Token Savior tools (REQUIRED when available):**
All Token Savior tools are now active. Use them instead of native tools (`read`, `search`, `find`, etc.).
- Prefer `search_codebase` over `search` for semantic and regex code search.
- Prefer `get_full_context` over `read` for symbol-level context (source + deps + dependents).
- Prefer `get_function_source` / `get_class_source` over `read` for a specific symbol's body.
- Prefer `find_symbol` over `find` to locate a symbol by name.
- Prefer `get_dependencies` / `get_change_impact` over manual import/callsite tracing.

Only fall back to native tools (`read`, `search`, `find`) if no Token Savior tool covers the operation.

**This protocol is not optional.** Skipping switch_project, or defaulting to native tools when Token Savior equivalents exist, are violations of these instructions.