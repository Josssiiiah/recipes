---
name: social-game-warp-tmux-layout
description: Manage the Social Game Warp tab config and tmux-pane launcher layout. Use this skill whenever the user asks to change, fix, inspect, or explain the Social Game tmux/Warp layout, mentions the backend/web/mobile panes in Warp, or wants a different pane arrangement for the Social Game dev environment.
---

# Social Game Warp Tmux Layout

Use this skill for project-specific changes to the Warp tab config that launches the Social Game backend, web, and mobile tmux sessions.

## Source Of Truth

The Warp tab config lives outside the repo:

```text
/Users/josiah/.warp/tab_configs/social_game_tmux.toml
```

The Social Game repo is:

```text
/Users/josiah/Dev/social-game
```

The three panes currently launch:

- `api`: `~/Dev/social-game/apps/backend`, command `tmux new-session -A -s social-game-api 'cd ~/Dev/social-game/apps/backend && bun run dev'`
- `web`: `~/Dev/social-game/apps/web`, command `tmux new-session -A -s social-game-web 'cd ~/Dev/social-game/apps/web && bun run dev'`
- `mobile`: `~/Dev/social-game/apps/mobile`, command `tmux new-session -A -s social-game-mobile 'cd ~/Dev/social-game/apps/mobile && bun start'`

## Current Intended Layout

The intended default layout is:

```text
+----------------------+----------------------+
|                      | web                  |
| backend / api        |----------------------|
| full left side       | mobile               |
|                      |                      |
+----------------------+----------------------+
```

In Warp tab config terms:

```toml
[[panes]]
id = "root"
split = "horizontal"
children = ["api", "side_stack"]

[[panes]]
id = "side_stack"
split = "vertical"
children = ["web", "mobile"]
```

Observed Warp split semantics in these configs:

- `split = "horizontal"` creates left/right columns.
- `split = "vertical"` creates top/bottom rows.
- Child order matters: first child is left/top, second child is right/bottom.

## Workflow

1. Read `/Users/josiah/.warp/tab_configs/social_game_tmux.toml` before editing.
2. Preserve the existing tmux session names and commands unless the user explicitly asks to change what starts.
3. Keep edits scoped to the Social Game tab config. Do not modify unrelated Warp tab configs unless the user asks.
4. Use `apply_patch` for manual edits.
5. Validate TOML after editing:

```sh
python3 -c 'import pathlib, tomllib; tomllib.loads(pathlib.Path("/Users/josiah/.warp/tab_configs/social_game_tmux.toml").read_text()); print("valid TOML")'
```

6. Read back the edited file and summarize the final layout in plain language.

## Safety Notes

- Editing the TOML affects future Warp tab launches. Existing open Warp tabs may need to be reopened for layout changes to apply.
- Do not kill or restart tmux sessions unless the user explicitly asks.
- If the user asks to operate Warp itself through the UI, use the Computer Use plugin, matching the project instruction to avoid Playwright/Puppeteer for computer-control tasks.
