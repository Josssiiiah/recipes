---
name: upload-to-testflight
description: Release an Expo app to Apple TestFlight/App Store Connect or publish an EAS Update. Use this skill whenever the user asks to upload, submit, ship, publish, push, release, update, or send an Expo app to TestFlight, App Store Connect, EAS Build, EAS Submit, or EAS Update. For the Recipes, Fitness, and Transcribe Expo apps, shorthand like "push the update" means the App Store Connect/TestFlight binary-upload flow by default, not an EAS Update or Git push. Also use for "push the TestFlight update", "upload to TestFlight", "update/upload to TestFlight", "send a new build", or "ship it."
---

# Expo Release To TestFlight

Use this skill for Expo app releases, especially these local repos:

```text
/Users/josiah/Dev/recipes
/Users/josiah/Dev/fitness
/Users/josiah/Dev/transcribe
```

The default TestFlight path is a local iOS build followed by direct Apple
upload with `xcrun altool`. Treat the Apple upload path as mandatory first
choice, not an optional optimization, whenever a fresh local IPA exists and
Apple credentials can be found or derived. Do not route an already-built IPA
through EAS Submit before trying Apple directly. Do not use cloud-build wrappers
such as `npx testflight` unless the user explicitly asks for the cloud flow or
local builds are impossible on the current machine. Local builds avoid EAS
cloud iOS build quota limits and make the generated IPA path explicit. Direct
Apple upload avoids EAS Submit worker outages and is usually much faster than
routing an already-built IPA back through EAS Submit.

When the user uses shorthand such as "push the update", "push to TestFlight",
"upload to TestFlight", "update/upload to TestFlight", "send a build", or
"ship it" while working in one of these Expo app repos, interpret that as a
request to run the App Store Connect/TestFlight binary-upload workflow. Do not
treat "push the update" as an OTA publish, EAS Update, Git push, or generic
deploy unless the user explicitly says that. The order is always:

1. Build a fresh local production iOS IPA.
2. Validate and upload that IPA directly to Apple with `xcrun altool`.
3. Fall back to EAS Submit only after direct Apple upload is impossible, for
   example no usable `.p8` key can be found/provided, no issuer ID can be found
   from App Store Connect or EAS metadata, or `altool` itself is unavailable.

## Release Choice

Default to a native TestFlight build through App Store Connect when the user
mentions TestFlight, App Store Connect, iOS build, binary, native build, or asks
to "push the update", "push the TestFlight update", "upload to TestFlight",
"update/upload to TestFlight", "send a build", or "ship it" from a release
context.

Use EAS Update only when the user explicitly asks for OTA, `eas update`, or an
over-the-air publish. Do not choose EAS Update just because the phrase contains
"update". Do not use EAS Update for changes to native modules, Expo config,
entitlements, permissions, app icons/splash that require native regeneration,
build profiles, iOS bundle settings, or dependency changes that affect native
code.

Do not interpret the word "update" by itself as EAS Update when the request says
"push the update" or also mentions uploading, pushing, TestFlight, App Store
Connect, Apple Store Connect, or a new build. In that case, use the native
TestFlight workflow first.

## Project Discovery

Start from the repo root the user is working in. If the repo root does not
contain `app.json` or `eas.json`, find the Expo app root before running EAS
commands. For Transcribe, the Expo app root is currently:

```text
/Users/josiah/Dev/transcribe/apps/mobile
```

Useful discovery checks:

```sh
pwd
find . -maxdepth 3 \( -name app.json -o -name app.config.js -o -name app.config.ts -o -name eas.json \) -print
```

Read `app.json` or `app.config.*` and `eas.json` before release so you know the
app name, slug, iOS bundle identifier, production profile, `autoIncrement`, and
App Store Connect app ID if configured.

Use a tmux session prefix based on the repo, for example:

```text
recipes-testflight-local-YYYYMMDD-HHMM
fitness-testflight-local-YYYYMMDD-HHMM
transcribe-testflight-local-YYYYMMDD-HHMM
```

## Native TestFlight Workflow

1. Create a persistent log directory at the repo root:

```sh
mkdir -p <repo-root>/.codex/logs
```

2. Check for an active release session:

```sh
tmux list-sessions
```

If a relevant TestFlight session is actively running, reuse and monitor it. If a
session is stale or sitting at a shell prompt from an old run, do not kill it
unless the user explicitly asks. Create a timestamped session instead.

3. Start a local iOS production build from the Expo app root:

```sh
tmux new-session -d -s <repo-prefix>-testflight-local-<timestamp> -c <expo-root> 'npx eas build --platform ios --profile production --local --non-interactive 2>&1 | tee <repo-root>/.codex/logs/<repo-prefix>-testflight-local-build-<timestamp>.log'
```

4. Monitor with `tmux capture-pane`, not screenshots:

```sh
tmux capture-pane -t <session-name> -p -S -500
```

Poll periodically until there is a clear terminal state. If the tmux session
exits before the final pane is captured, read the matching log file in
`<repo-root>/.codex/logs/` and use it as the source of truth.

5. When the local build succeeds, extract the fresh IPA path from output like:

```text
You can find the build artifacts in /path/to/app/build-<timestamp>.ipa
```

Submit that exact IPA path. Do not submit a generic project artifact path such
as `build/RecipeLibrary.ipa`, `build/<AppName>.ipa`, or any existing IPA unless
you have just verified it was written by the current build and has the expected
new `CFBundleVersion`. These files can be stale from previous runs.

Optional IPA version check:

```sh
rm -rf /tmp/expo-ipa-check
mkdir -p /tmp/expo-ipa-check
unzip -q <fresh-local-ipa> 'Payload/*.app/Info.plist' -d /tmp/expo-ipa-check
plutil -extract CFBundleVersion raw /tmp/expo-ipa-check/Payload/*.app/Info.plist
plutil -extract CFBundleShortVersionString raw /tmp/expo-ipa-check/Payload/*.app/Info.plist
```

6. Upload directly to Apple with `xcrun altool` by default.

This is the required first submit path after a successful local IPA build. Use
it when a local App Store Connect API key `.p8` exists or the user can provide
one. For Recipes, a known local key may exist at:

```text
/Users/josiah/Downloads/AuthKey_64NJRF7W8W.p8
```

Treat `.p8` files as secrets: do not print their contents, paste them into chat,
commit them, or move them into the repo. It is OK to use the file path locally.
The Key ID is usually the filename segment in `AuthKey_<KEY_ID>.p8`. The Issuer
ID can come from App Store Connect or from EAS credential metadata if already
configured. If the local `.p8` exists but the issuer ID is not immediately
known, do not fall back to EAS Submit yet. First inspect EAS credential metadata
without printing key material and query only the key identifier and issuer
identifier. A successful EAS Submit configuration proves the issuer metadata is
usually available even if EAS Submit workers are unhealthy.

Validate the fresh IPA before upload:

```sh
xcrun altool --validate-app \
  -f <fresh-local-ipa> \
  --api-key <key-id> \
  --api-issuer <issuer-id> \
  --p8-file-path <path-to-AuthKey_key-id.p8> \
  --output-format json
```

Proceed only if validation succeeds. Then upload directly to Apple:

```sh
tmux new-session -d -s <repo-prefix>-altool-upload-<timestamp> -c <expo-root> 'xcrun altool --upload-app -f <fresh-local-ipa> --api-key <key-id> --api-issuer <issuer-id> --p8-file-path <path-to-AuthKey_key-id.p8> --output-format json --show-progress 2>&1 | tee <repo-root>/.codex/logs/<repo-prefix>-altool-upload-<timestamp>.log'
```

Monitor the upload session with `tmux capture-pane`. Treat success as output
containing `UPLOAD SUCCEEDED`, `Upload succeeded`, and a `Delivery UUID`.

After upload succeeds, check Apple processing status:

```sh
xcrun altool --build-status \
  --delivery-id <delivery-uuid> \
  --api-key <key-id> \
  --api-issuer <issuer-id> \
  --p8-file-path <path-to-AuthKey_key-id.p8> \
  --output-format json
```

Report `VALID` as the successful terminal upload state. If Apple reports
`PROCESSING`, say the upload is accepted and still processing in App Store
Connect. If Apple returns package validation errors, report those as app/package
issues and do not retry blindly.

7. Use EAS Submit only as a last-resort fallback.

Do not start EAS Submit merely because it is configured or because EAS has an
App Store Connect API key on its servers. EAS Submit is allowed only if direct
Apple upload cannot be used: there is no local `.p8` and the user cannot provide
one, no issuer ID can be found from App Store Connect or EAS metadata, the user
does not want to use Apple tooling, or `altool` is missing/broken. In that case,
submit the fresh IPA from the Expo app root:

```sh
tmux new-session -d -s <repo-prefix>-testflight-submit-<timestamp> -c <expo-root> 'npx eas submit --platform ios --profile production --path <fresh-local-ipa> --wait 2>&1 | tee <repo-root>/.codex/logs/<repo-prefix>-testflight-submit-<timestamp>.log'
```

Monitor the submit session until it clearly succeeds, fails, or asks for user
interaction. Treat success only as output saying the binary was uploaded or
submitted to Apple App Store Connect, or output providing an App Store
Connect/TestFlight link after submission.

For resubmitting an EAS cloud build that already exists, use EAS Submit only when you
have a real build ID and `submit.production.ios.ascAppId` is configured:

```sh
npx eas submit -p ios --id <build-id> --wait 2>&1 | tee <repo-root>/.codex/logs/<repo-prefix>-testflight-submit-<build-id>-<timestamp>.log
```

## EAS Update Workflow

Use this only for OTA-safe JS/asset updates.

1. Confirm the app has an update channel or branch policy in `eas.json`.
2. Run from the Expo app root.
3. Publish with an explicit message:

```sh
npx eas update --channel production --message "<short release note>"
```

If the project uses branches instead of channels, use the repo's established EAS
Update convention. Do not invent a channel name when `eas.json` points to a
different deployment scheme.

After publishing, report the update URL/group ID if EAS prints one, plus the
runtime version/channel. Remind the user that OTA updates only reach compatible
installed binaries.

## User Interaction

If EAS asks for Apple login, 2FA, credential confirmation, App Store Connect
access, or any other prompt that requires private information or an account
decision:

- Except for the auto-confirmed Apple login prompts below, pause and tell the
  user exactly what prompt is waiting.
- Do not enter passwords, 2FA codes, API keys, app-specific passwords, or
  secrets.
- Continue monitoring after the user completes the prompt.

Specific Apple login handling:

- For `Do you want to log in to your Apple account? (Y/n)`, send `y` and
  `Enter` to the tmux session without asking the user first.
- If the next prompt is `Apple ID:` and the expected Apple ID is already
  prefilled, press `Enter` without asking the user first. This is not a secret.
- If the `Apple ID:` prompt is empty or shows an unexpected account, ask the
  user what to use.
- If the prompt asks for password, 2FA, trusted-device confirmation,
  app-specific password, API key creation, or any private credential, stop and
  ask the user to complete that step.

For other non-secret yes/no prompts, make the conservative choice that matches
the existing project setup. When uncertain, ask the user before sending input.

## Failure Handling

If a build or submit fails, capture the relevant final 100-200 lines and
summarize the root cause with the actionable next step.

Common failures:

- EAS cloud iOS quota exhausted: stay on the local build flow above; do not
  switch back to `npx testflight`.
- EAS Submit worker outage or repeated `SPIN_UP_SUBMISSION_WORKER` failures:
  keep the local IPA, validate it with `xcrun altool --validate-app`, then use
  direct Apple upload with `xcrun altool --upload-app` if a local `.p8` key is
  available. Do not rebuild just to work around an EAS Submit infrastructure
  failure.
- Missing production build profile: add or fix the `production` profile in
  `eas.json`, with `autoIncrement: true` for iOS releases.
- Missing `EXPO_PUBLIC_*` production URL: create it in the EAS `production`
  environment with a public HTTPS backend URL, then rerun the local build.
- No App Store Connect app record: create the app in App Store Connect with the
  iOS bundle identifier from `app.json`, then rerun.
- Duplicate build number: confirm the production profile has
  `autoIncrement: true`, then rebuild and submit the newly generated IPA.
- Stale IPA submitted: locate the fresh `build-<timestamp>.ipa`, verify
  `CFBundleVersion`, and submit that exact path.
- Apple credential or API key problems: inspect `eas credentials -p ios` only if
  needed, and do not delete credentials without explicit permission.
- Direct Apple upload says `VALID` but the build is not visible in TestFlight
  yet: report that Apple accepted the upload and App Store Connect may still be
  processing it. Do not resubmit the same build number unless Apple later
  rejects or loses the build.
- Backend connectivity after install: verify the app was built with a public
  HTTPS backend URL; TestFlight cannot call `localhost`.

## Safety Notes

- Do not push commits unless the user explicitly asks.
- Do not kill, restart, or send input to unrelated tmux sessions.
- Do not use Playwright or Puppeteer for this workflow.
- If a web UI must be operated manually, use the Computer Use plugin when the
  project instructions require it.
- Avoid inspecting full process command lines for local EAS builds because they
  can include credential material. Use tmux logs, EAS output, and PID-only
  process checks instead.
