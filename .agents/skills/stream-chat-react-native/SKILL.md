---
name: stream-chat-react-native
description: Build, configure, customize, or evaluate Stream Chat in React Native and Expo apps. Use this skill whenever the user mentions Stream, GetStream, stream-chat-react-native, Stream Chat, chat SDKs for React Native, Expo chat, custom chat UI backed by Stream, message lists, chat composers, channels, typing indicators, read receipts, or iMessage-style chat backed by a third-party SDK.
---

# Stream Chat React Native

Use this skill to integrate Stream Chat into Expo or React Native apps while keeping the product UI under app control.

Always prefer current docs over memory. First resolve/query Context7 for `/getstream/stream-chat-react-native` when API details matter, then use official Stream docs as fallback:

- Context7 library ID: `/getstream/stream-chat-react-native`
- Official React Native docs: https://getstream.io/chat/docs/sdk/react-native/
- Expo tutorial: https://getstream.io/chat/sdk/react-native/tutorial/expo/
- React Native SDK GitHub: https://github.com/GetStream/stream-chat-react-native

## Default Approach

When the user wants a non-opinionated or app-specific UI, use Stream for infrastructure and keep React Native components local:

1. Let Stream own realtime chat state: client connection, channels, messages, typing, read receipts, reactions, attachments, presence, moderation, and push support.
2. Let the app own the visible UI: route structure, chat header, message bubbles, grouping, composer, timestamps, empty states, loading states, and error states.
3. Avoid adopting the full Stream UIKit look unless the user explicitly wants fast default UI.
4. Prefer a hybrid when useful: `Chat`/`OverlayProvider`/`Channel` from Stream, custom message/composer components from the app.

## Documentation Workflow

Before writing or changing Stream-specific code:

1. Query Context7:

   ```text
   Library: /getstream/stream-chat-react-native
   Query: Expo setup, installation, useCreateChatClient, Chat, OverlayProvider, Channel, MessageList, MessageInput, custom component overrides, hooks, base UI components
   ```

2. Check the Expo tutorial for package setup and Expo-specific caveats.
3. Check the React Native docs for the exact component prop or hook being used.
4. Use this skill's guidance for architecture and project fit, but let the docs decide exact signatures.

## Expo Setup Pattern

Use Bun commands in this repo unless the user asks otherwise:

```sh
bunx expo install stream-chat-react-native stream-chat
```

Then verify whether the current Stream docs require additional peer dependencies for the installed Expo SDK. Do not guess on native dependencies; Stream's React Native package has changed over time.

For Expo apps, start with Expo Go if the dependency set supports it. Move to a dev build only when the documented dependency list or native feature requirements demand it.

## Client Provider Pattern

The common current pattern is:

```tsx
import {
  Chat,
  OverlayProvider,
  Streami18n,
  useCreateChatClient,
} from "stream-chat-react-native";

const i18nInstance = new Streami18n({ language: "en" });

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const chatClient = useCreateChatClient({
    apiKey: streamApiKey,
    userData: {
      id: currentUser.id,
      name: currentUser.name,
      image: currentUser.image,
    },
    tokenOrProvider: getStreamToken,
  });

  if (!chatClient) {
    return null;
  }

  return (
    <OverlayProvider i18nInstance={i18nInstance}>
      <Chat client={chatClient} i18nInstance={i18nInstance}>
        {children}
      </Chat>
    </OverlayProvider>
  );
}
```

Treat tokens as server-owned. The mobile app should request a Stream user token from the app backend after normal auth. Never hardcode production Stream secrets or token-generation secrets in the app.

## Custom UI Options

There are three levels of UI ownership:

### Full Stream UI

Use this for prototypes:

```tsx
<Channel channel={channel} keyboardVerticalOffset={headerHeight}>
  <MessageList />
  <MessageInput />
</Channel>
```

This is fastest, but most visually opinionated.

### Hybrid UI

Use Stream's data/context components but replace visual pieces:

```tsx
<Channel
  channel={channel}
  keyboardVerticalOffset={headerHeight}
  MessageSimple={AppMessageBubble}
  EmptyStateIndicator={EmptyChatState}
>
  <MessageList />
  <MessageInput Input={AppChatComposer} />
</Channel>
```

This is usually the best first production path when the user wants custom bubbles but still wants Stream's pagination, list behavior, composer behavior, attachments, and message actions.

### App-Owned UI

Use this when the UI needs to be fully non-opinionated:

- Use Stream client/channel APIs or hooks for messages and events.
- Render an app-owned `FlatList`.
- Build app-owned `MessageBubble`, `MessageGroup`, `ChatComposer`, `TypingIndicator`, and `DaySeparator`.
- Keep optimistic sends, failed-send state, and retry affordances explicit.

This gives the most control but requires implementing more chat edge cases.

## iMessage-Style Implementation Notes

For iMessage-inspired UI:

- Use right-aligned outgoing bubbles and left-aligned incoming bubbles.
- Group consecutive messages from the same sender.
- Show avatars/names only where they reduce ambiguity.
- Keep timestamps sparse: group separators, long press, or tap reveal.
- Use `FlatList` or Stream `MessageList`, not a plain `ScrollView`, for message timelines.
- Use keyboard-aware layout from Stream's `MessageInput` or a documented keyboard controller pattern.
- Include loading, empty, sending, sent, failed, and retry states.
- Keep visual language inspired, not copied: system colors, compact spacing, rounded bubbles, and native motion.

## Backend Requirements

A production Stream integration normally needs backend endpoints for:

- Creating Stream user tokens for authenticated app users.
- Creating or resolving channels for game/social conversations.
- Syncing app user identity to Stream user identity.
- Webhooks if the app needs to persist message-derived events, moderation events, or analytics in its own database.
- Push notification configuration when chat notifications ship.

Do not generate Stream tokens on the client. Do not expose Stream API secrets to mobile or web clients.

## Root-Cause Preference

When debugging Stream chat, look for the underlying broken contract before adding retries or fallbacks:

- Auth mismatch: app user id differs from Stream user id.
- Token issue: expired token, wrong user id, dev token in production, secret leaked to client.
- Channel issue: wrong type/id, missing members, channel not watched.
- Provider issue: `Chat`, `OverlayProvider`, or `Channel` missing or mounted in the wrong route boundary.
- Keyboard/inset issue: missing safe-area integration or wrong `keyboardVerticalOffset`.
- Realtime issue: client disconnected, duplicate client instances, user connected twice, or events not watched.

## Repo Fit

For `/Users/josiah/Dev/social-game`:

- Use Bun commands.
- The mobile app is under `apps/mobile`.
- Expo Router routes are under `apps/mobile/src/app`.
- Keep reusable chat UI outside route files, for example under `apps/mobile/src/components/chat/`.
- For chat UI work, follow the Expo native UI guidance already available in this environment.
- If adding database schema for Stream mapping or chat metadata, run `bun run db:generate` and `bun run db:migrate` as required by the repo instructions.

## Quick Checklist

Before finalizing Stream work:

- Current Stream docs were consulted for exact API/package details.
- Tokens are backend-generated and not hardcoded.
- Provider boundaries are clear.
- UI ownership level is explicit: full Stream, hybrid, or app-owned.
- Message list handles pagination, loading, empty, and failed states.
- Composer handles keyboard and safe area correctly.
- Expo app was linted or typechecked with the repo's Bun scripts when practical.

## References

Read `references/docs.md` for the current documentation links and the specific Context7 queries that have been useful for this project.
