## MCP Tools

- CRITICAL: NEVER batch MCP tool calls with other tools. Each MCP call must be alone in its own message turn.

### Token Savior MCP

Token Savior MCP tools are already active in your session — no activation step is needed.

Use them instead of native tools for code navigation:
- Prefer `search_codebase` over `search` for semantic and regex code search.
- Prefer `get_full_context` over `read` for symbol-level context (source + deps + dependents).
- Prefer `get_function_source` / `get_class_source` over `read` for a specific symbol's body.
- Prefer `find_symbol` over `find` to locate a symbol by name.
- Prefer `get_dependencies` / `get_change_impact` over manual import/callsite tracing.

Only fall back to native tools (`read`, `search`, `find`) if no Token Savior tool covers the operation. Call `switch_project` to ensure the correct project is active before using these tools — it is idempotent and safe to call even if already activated.
