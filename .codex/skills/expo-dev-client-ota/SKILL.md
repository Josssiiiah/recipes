---
name: expo-dev-client-ota
description: Use when working on Expo apps that hit Expo Go compatibility errors, custom native modules, EAS development builds, native-module redboxes, or EAS Update/OTA questions. Helps decide whether a change can reload through Metro, ship through OTA, or requires a new native build/install.
---

# Expo Dev Client vs OTA

## First Decision

Ask one question first: did the change alter the native runtime?

Native runtime changes require a new EAS/native build and reinstall:

- Add, remove, or upgrade a native package such as `expo-network`, `expo-camera`, `react-native-audio-api`, or most `react-native-*` packages.
- Change native-affecting app config: plugins, permissions, entitlements, bundle identifiers, schemes, Info.plist, AndroidManifest, associated domains, notification config, or config-plugin output.
- Change Expo SDK, React Native, Hermes, new architecture, CocoaPods, Gradle, iOS/Android folders, or prebuild output.
- See runtime errors like `Cannot find native module 'ExpoNetwork'`.

JS/assets-only changes do not require a new build:

- React components, screens, navigation, styles, API calls, auth logic, validation, copy, and most business logic.
- JS-only npm packages.
- Images, fonts, and other assets supported by EAS Update.

## Local Development

For apps with custom native code, use a development client, not Expo Go.

Start Metro for the dev client:

```bash
npx expo start --dev-client
```

Build a dev client when native runtime changes:

```bash
npx eas-cli build -p ios --profile development
```

After the dev client is installed, normal JS/TS edits should reload through Metro. Do not rebuild for every screen, style, or logic change.

## OTA Updates

OTA means EAS Update. It can ship JS and assets to an already installed binary only when the binary already contains the required native runtime.

Check that the app has `expo-updates`, an `updates.url`, a `runtimeVersion`, and a channel baked into the installed build. Then publish:

```bash
npx eas-cli update --channel development --message "Describe the change"
```

OTA cannot add a missing native module to an installed binary. If the installed app was built before `expo-network` existed in the project, an OTA update cannot make `ExpoNetwork` appear.

## Error Mapping

- `Project is not compatible with this version of Expo Go`: use a dev client, or downgrade to an Expo SDK supported by current Expo Go only if the app does not need custom native modules.
- `Unable to resolve module X`: the JS package is missing from the project. Install it with `npx expo install X` or the repo's package manager. If `X` includes native code, rebuild after installing.
- `Cannot find native module X`: the JS package exists, but the installed app binary was built without the native module. Rebuild and reinstall the dev client.
- Other apps work in Expo Go: compare dependencies and config. The likely difference is a native module or config plugin in the failing app.

## Practical Rule

Use this loop:

1. Install native dependency or change native config.
2. Run `expo-doctor` / project checks.
3. Build and install a new dev client once.
4. Use Metro for local JS iteration.
5. Use EAS Update for JS/assets releases that match the installed runtime.
