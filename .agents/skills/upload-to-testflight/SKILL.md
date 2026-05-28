---
name: upload-to-testflight
description: Upload the Recipes Expo app to Apple TestFlight and monitor the tmux output until the build/submission clearly succeeds, fails, or needs user interaction. Use this skill whenever the user asks to upload, submit, ship, publish, push, release, or send the Recipes app to TestFlight, even if they only say "upload to TestFlight" or "send a new iOS build."
---

# Upload To TestFlight

Use this skill for the Recipes project at:

```text
/Users/josiah/Dev/recipes
```

The upload command is:

```sh
npx testflight
```

Run it in tmux so the long-running build and Apple submission can be monitored without losing output.

## Workflow

1. Start from the repo root:

```sh
cd /Users/josiah/Dev/recipes
```

2. Check whether a TestFlight tmux session already exists:

```sh
tmux list-sessions
```

3. If no active upload session exists, start one named `recipes-testflight`:

```sh
tmux new-session -d -s recipes-testflight -c /Users/josiah/Dev/recipes 'npx testflight'
```

If `recipes-testflight` already exists and is actively running an upload, reuse and monitor it. If the existing session is stale or sitting at a shell prompt from an old run, do not kill it unless the user explicitly asks. Create a timestamped session instead, such as `recipes-testflight-YYYYMMDD-HHMM`.

4. Monitor with `tmux capture-pane`, not screenshots:

```sh
tmux capture-pane -t recipes-testflight -p -S -500
```

Poll periodically until there is a clear terminal state.

## Success Criteria

Treat the upload as successful only when the tmux output says the binary was uploaded to App Store Connect, submitted to Apple App Store Connect, or provides an App Store Connect/TestFlight build link after submission.

After success:

- Report the build number if visible.
- Report the Expo build/submission URL if visible.
- Report the App Store Connect/TestFlight URL if visible.
- Tell the user Apple may still need several minutes to finish processing before the build appears in TestFlight.

## User Interaction

If the command asks for Apple login, 2FA, credential confirmation, App Store Connect access, or any other prompt that requires private information or an account decision:

- Pause and tell the user exactly what prompt is waiting.
- Do not enter passwords, 2FA codes, API keys, or secrets.
- Continue monitoring after the user completes the prompt.

For non-secret yes/no prompts, make the conservative choice that matches the existing project setup. When uncertain, ask the user before sending input.

## Failure Handling

If the command fails, capture the relevant final 100-200 lines and summarize the root cause. Include the actionable next step.

Common failures:

- Missing `EXPO_PUBLIC_RECIPE_API_URL`: create it in the EAS `production` environment with the public HTTPS backend URL, then rerun `npx testflight`.
- No App Store Connect app record: create the app in App Store Connect with bundle ID `com.josiah.recipelibrary`, then rerun.
- Duplicate build number: confirm `eas.json` production has `autoIncrement: true`, then rerun.
- Apple credential or API key problems: run or inspect `eas credentials -p ios` only if needed, and do not delete credentials without explicit permission.
- Backend connectivity after install: verify the app was built with a public HTTPS `EXPO_PUBLIC_RECIPE_API_URL`; TestFlight cannot call `localhost`.

## Safety Notes

- Do not push commits unless the user explicitly asks.
- Do not kill, restart, or send input to unrelated tmux sessions.
- Do not use Playwright or Puppeteer for this workflow.
- If a web UI must be operated manually, use the Computer Use plugin per project instructions.
