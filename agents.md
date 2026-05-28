# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

## Recipe Data Contract

Every recipe must include a concise `description` in addition to numbered `instructions`.
The description is a user-facing summary of the finished dish, not a place for cooking steps.
When generating, importing, seeding, backfilling, or editing recipe records, populate both fields.


## Error Handling and Logging

- Add explicit error handling and useful logging around brittle or sensitive boundaries: auth/session lookup, database writes and migrations, AI/model calls, third-party APIs, file/network I/O, payment/deploy/webhook flows, and cross-app API calls.
- Prefer failing loudly with actionable messages over silent no-ops, generic "not found" errors, swallowed exceptions, or UI states that look like a refresh.
- Log enough context to debug the root cause: route/action name, relevant IDs, status codes, provider names, and sanitized error messages. Never log secrets, raw tokens, session cookies, OAuth credentials, API keys, or sensitive user content.
- Catch errors where you can add context, clean up partial work, convert provider errors into user-safe responses, or keep the UI from hanging. Do not catch just to suppress the failure.
- For transactional or multi-step work, log the boundary before/after the operation and use transactions where possible so partial state is not persisted.
- In user-facing flows, surface a clear recoverable error state or alert when an action fails, and keep detailed diagnostics in server logs.
- Avoid obnoxious retries and fallback chains. If a retry is warranted, keep it bounded and explain why; prefer fixing the underlying failing dependency or contract.

## Local Development Logs

- When asked to check running Recipes logs, read the existing tmux sessions directly with `tmux capture-pane`; do not use Computer Use just to inspect tmux output.
- Current development sessions are `recipes-api`, `recipes-expo`, and `recipes-typecheck`. Useful commands:
  - `tmux capture-pane -t recipes-api -p -S -400`
  - `tmux capture-pane -t recipes-expo -p -S -300`
  - `tmux capture-pane -t recipes-typecheck -p -S -200`
- Use `tmux list-sessions` first if a session name might have changed. Do not kill, restart, or send input to tmux sessions unless I explicitly ask.
- Treat terminal screenshots as hints, then verify with captured logs so stack traces and repeated warnings are not truncated by the UI.
- After making changes that affect a running dev service, check the relevant tmux logs before reporting completion so runtime errors, reload failures, and repeated warnings are caught immediately.
