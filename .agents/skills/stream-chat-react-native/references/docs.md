# Stream Chat React Native Documentation References

Use these references instead of relying on remembered API details.

## Primary Docs

- Context7 library ID: `/getstream/stream-chat-react-native`
- Official React Native SDK docs: https://getstream.io/chat/docs/sdk/react-native/
- Expo tutorial: https://getstream.io/chat/sdk/react-native/tutorial/expo/
- React Native SDK GitHub: https://github.com/GetStream/stream-chat-react-native
- Stream Chat product docs: https://getstream.io/chat/docs/

## Useful Context7 Queries

Use these with the Context7 `query_docs` tool:

```text
Library: /getstream/stream-chat-react-native
Query: Expo setup for stream-chat-react-native, required packages, useCreateChatClient, OverlayProvider, Chat, Channel, MessageList, MessageInput
```

```text
Library: /getstream/stream-chat-react-native
Query: Custom React Native message UI, MessageSimple override, custom MessageInput Input component, EmptyStateIndicator, channel preview customization
```

```text
Library: /getstream/stream-chat-react-native
Query: Non-opinionated custom UI using Stream Chat React Native hooks, channel context, message context, message actions, typing and read state
```

```text
Library: /getstream/stream-chat-react-native
Query: React Native push notifications, unread counts, read receipts, typing indicators, reactions, attachments, Expo caveats
```

## Patterns Confirmed From Docs

The docs currently show these high-level patterns:

- Initialize a client with `useCreateChatClient({ apiKey, userData, tokenOrProvider })`.
- Wrap app chat surfaces in `OverlayProvider` and `Chat`.
- Use `Channel` to scope a channel screen.
- Use `MessageList` and `MessageInput` for a quick full chat surface.
- Override Stream UI pieces with props such as `MessageSimple`, `EmptyStateIndicator`, and `MessageInput`'s custom `Input` component.
- Use `Streami18n` when configuring Stream localization.

Validate exact prop names against current docs before implementing; this reference is intentionally compact and may lag behind package changes.
