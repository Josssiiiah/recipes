---
name: react-effect-elimination
description: Refactor React components to remove unnecessary useEffect calls and keep Effects only for true external synchronization. Use this skill whenever working in React, React Native, Expo, Next.js, or TanStack projects and the task mentions useEffect, derived state, prop-to-state syncing, stale state, reset-on-prop-change, parent notifications, data fetching, subscriptions, memoization, event handlers, race conditions, or confusing render/update loops. Also use it proactively during React code review when an Effect sets state.
---

# React Effect Elimination

Use this skill to decide whether a React `useEffect` is necessary, and to refactor unnecessary Effects into render-time calculations, event handlers, keys, lifted state, purpose-built hooks, or framework data fetching.

Effects are an escape hatch. They are for synchronizing a component with an external system that React does not control: browser APIs, timers, subscriptions, imperative widgets, analytics caused by display, and network state tied to the component being visible. If no external system is involved, suspect the Effect is a code smell.

## Core Decision

Before preserving or adding an Effect, answer this:

1. What external system is being synchronized?
2. Why should this logic run: because the component is visible, because a value changed, or because the user performed a specific action?
3. Could the value be calculated from existing props/state during render?
4. Could the work happen in the event handler that caused it?
5. Would lifting state, using a `key`, or using a purpose-built hook remove the synchronization problem?

If there is no external system, remove the Effect unless there is a rare same-component render-time state adjustment with a tight guard.

## Valid Reasons To Keep An Effect

Keep an Effect when the component must synchronize with something outside React:

- Imperative browser APIs: `document.title`, focus, media playback, observers, geolocation.
- Timers or animation loops that need setup and cleanup.
- External event sources: WebSocket, DOM events, third-party SDK listeners.
- Imperative non-React widgets that must be created, updated, or destroyed.
- Data fetching whose cause is "this component is showing data for these params", when no router/framework/query library owns the fetch.
- Analytics or logging caused by the component being displayed, not by a specific user event.

When keeping an Effect, require cleanup for subscriptions, timers, observers, and in-flight async work that can become stale.

## Red Flags

Review these Effects first:

- An Effect that only calls `setState` from props or other state.
- State named like `filtered`, `sorted`, `visible`, `fullName`, `isValid`, `count`, `total`, or `selectedItem` that can be derived.
- An Effect that submits, saves, buys, deletes, sends a notification, navigates, or calls a parent callback after state changes.
- An Effect that resets form fields when an `id` prop changes.
- Chains of Effects where each Effect updates state that triggers another Effect.
- Child components that fetch data or compute data and then pass it up to the parent in an Effect.
- External store subscriptions implemented manually with `useEffect` and `useState`.
- Fetching Effects without cleanup or stale-response handling.

## Refactor Patterns

### 1. Derived Render Data

Do not store values that can be calculated from props/state. Calculate them in the component body.

```tsx
// Avoid
const [fullName, setFullName] = useState("");
useEffect(() => {
  setFullName(`${firstName} ${lastName}`);
}, [firstName, lastName]);

// Prefer
const fullName = `${firstName} ${lastName}`;
```

Use this for filtered lists, sorted lists, totals, counts, validation booleans, labels, JSX fragments, and selected objects derived from IDs.

### 2. Expensive Pure Calculations

Start with direct render-time calculation. Add `useMemo` only when the calculation is measurably expensive or creates referential churn that matters.

```tsx
const visibleTodos = useMemo(
  () => getVisibleTodos(todos, filter),
  [todos, filter],
);
```

The function inside `useMemo` must be pure because it runs during render. Do not put network calls, logging side effects, DOM mutations, state updates, or subscriptions in `useMemo`.

If an unrelated local state update is causing expensive recalculation, also consider moving that unrelated state into a child component so the parent does not re-render.

### 3. Reset All State On Identity Change

When a prop change means the subtree is conceptually a different entity, use a `key` instead of an Effect that clears state.

```tsx
export function ProfilePage({ userId }: { userId: string }) {
  return <Profile key={userId} userId={userId} />;
}

function Profile({ userId }: { userId: string }) {
  const [comment, setComment] = useState("");
  // State resets when userId changes.
}
```

Use this for edit forms, profile pages, detail panes, wizard instances, and route params where all nested state should reset together.

### 4. Adjust Part Of State On Prop Change

First try to avoid adjustment entirely by storing the minimal durable state.

```tsx
const [selectedId, setSelectedId] = useState<string | null>(null);
const selectedItem = items.find((item) => item.id === selectedId) ?? null;
```

Prefer storing IDs over whole objects. If the selected item disappears, the render-time calculation naturally returns `null`.

Only if you truly need to adjust same-component state during render, guard it with previous input state:

```tsx
const [prevItems, setPrevItems] = useState(items);
const [selection, setSelection] = useState<Item | null>(null);

if (items !== prevItems) {
  setPrevItems(items);
  setSelection(null);
}
```

This is allowed only for the same component's state, with a strict condition that prevents loops. Do not perform side effects during render.

### 5. User Events Belong In Event Handlers

If the cause is a click, submit, drag, select, keystroke, or command, put the work in the handler. Do not encode the event as state and then react to that state in an Effect.

```tsx
// Avoid
const [jsonToSubmit, setJsonToSubmit] = useState<FormData | null>(null);
useEffect(() => {
  if (jsonToSubmit) post("/api/register", jsonToSubmit);
}, [jsonToSubmit]);

function handleSubmit(event: FormEvent) {
  event.preventDefault();
  setJsonToSubmit({ firstName, lastName });
}

// Prefer
function handleSubmit(event: FormEvent) {
  event.preventDefault();
  post("/api/register", { firstName, lastName });
}
```

This applies to POST requests, notifications, navigation, purchases, deletes, saves, analytics caused by a specific interaction, and parent callbacks caused by local interactions.

### 6. Share Event Logic With Functions

When multiple handlers need the same behavior, extract a function and call it from those handlers.

```tsx
function buyProduct() {
  addToCart(product);
  showNotification(`Added ${product.name} to the cart`);
}

function handleBuyClick() {
  buyProduct();
}

function handleCheckoutClick() {
  buyProduct();
  navigateTo("/checkout");
}
```

Do not use an Effect as a shared callback mechanism.

### 7. Replace Chains Of Effects With One Transition

Effects that trigger each other through state updates are inefficient and fragile. Calculate next state in the event handler that caused the transition.

```tsx
function handlePlaceCard(nextCard: Card) {
  if (round > 5) throw new Error("Game already ended.");

  setCard(nextCard);

  if (!nextCard.gold) return;

  const nextGoldCardCount = goldCardCount + 1;
  if (nextGoldCardCount <= 3) {
    setGoldCardCount(nextGoldCardCount);
    return;
  }

  const nextRound = round + 1;
  setGoldCardCount(0);
  setRound(nextRound);

  if (nextRound > 5) {
    alert("Good game!");
  }
}
```

Remember that state variables inside handlers are snapshots. If later calculations need the updated value, create a `nextValue` variable.

### 8. Notify Parents During The Event

Do not update a child, wait for the child to render, and then notify the parent from an Effect. Update both during the event.

```tsx
function Toggle({ onChange }: { onChange: (next: boolean) => void }) {
  const [isOn, setIsOn] = useState(false);

  function updateToggle(nextIsOn: boolean) {
    setIsOn(nextIsOn);
    onChange(nextIsOn);
  }

  return <button onClick={() => updateToggle(!isOn)} />;
}
```

If parent and child both need the same state, prefer a controlled component:

```tsx
function Toggle({
  isOn,
  onChange,
}: {
  isOn: boolean;
  onChange: (next: boolean) => void;
}) {
  return <button onClick={() => onChange(!isOn)} />;
}
```

Whenever two components synchronize state variables with Effects, consider lifting state to their nearest common parent.

### 9. Pass Data Down, Not Up From Effects

Avoid this shape:

```tsx
function Child({ onFetched }: { onFetched: (data: Data) => void }) {
  const data = useSomeAPI();
  useEffect(() => {
    if (data) onFetched(data);
  }, [data, onFetched]);
}
```

If parent and child both need the data, fetch or subscribe in the parent and pass data down:

```tsx
function Parent() {
  const data = useSomeAPI();
  return <Child data={data} />;
}
```

This keeps React data flow traceable.

### 10. External Stores Use `useSyncExternalStore`

For external mutable stores, browser state, or third-party subscriptions, prefer `useSyncExternalStore` over manual `useEffect` + `useState`.

```tsx
function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function useOnlineStatus() {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
```

Define `subscribe` outside the component when possible so React does not resubscribe unnecessarily.

### 11. Data Fetching Effects Need Race Protection

Fetching can belong in an Effect when the component should stay synchronized with network data for current params. But raw Effects need cleanup to ignore stale responses.

```tsx
useEffect(() => {
  let ignore = false;

  async function load() {
    const json = await fetchResults(query, page);
    if (!ignore) setResults(json);
  }

  load().catch((error) => {
    if (!ignore) setError(error);
  });

  return () => {
    ignore = true;
  };
}, [query, page]);
```

Prefer framework loaders, route-level data APIs, or query libraries when available. In this repo, if TanStack Query is already used, prefer query keys, `useQuery`, and mutations over custom fetch Effects.

### 12. App Initialization

Do not hide fragile one-time app initialization inside a component Effect unless remounting is safe. If the code truly runs once per app load, use a guarded module-level initializer in the app entry/root module.

```tsx
let didInit = false;

export function App() {
  useEffect(() => {
    if (didInit) return;
    didInit = true;
    loadDataFromLocalStorage();
    checkAuthToken();
  }, []);
}
```

For pure browser-only initialization that can run before render, module initialization may be clearer:

```tsx
if (typeof window !== "undefined") {
  checkAuthToken();
  loadDataFromLocalStorage();
}
```

Use this sparingly and only in root or entry modules, not arbitrary component modules.

## Review Workflow

When asked to review or refactor React code:

1. List every `useEffect` and classify it as external sync, derived state, event logic, reset logic, parent notification, data fetch, or subscription.
2. Remove derived-state Effects first; replace with render-time values or `useMemo` only when justified.
3. Move event-caused work into the exact handler that caused it.
4. Replace reset Effects with `key` boundaries when the identity changes.
5. Replace cross-component synchronization with lifted state or controlled components.
6. Replace manual external store subscriptions with `useSyncExternalStore`.
7. For remaining fetch Effects, add stale-response cleanup and explicit error/loading handling.
8. Confirm dependency arrays after refactoring; fewer Effects usually means fewer dependency problems.

## Dependency Array Guidance

Do not solve dependency warnings by deleting dependencies or disabling lint rules. A noisy dependency array is often evidence that the Effect owns the wrong logic.

- If adding a dependency causes an event to repeat, move the event logic into the event handler.
- If a dependency is a derived value, derive it during render.
- If a function dependency changes every render, ask whether the function belongs inside the Effect, outside the component, or in an event handler.
- If the Effect subscribes to an external system, stabilize only the values that define the subscription and clean up correctly.

## Output Style

When reporting changes, explain each removed Effect by naming the replacement pattern:

- "Derived `visibleTodos` during render instead of syncing it into state."
- "Moved submit POST into `handleSubmit` because it is caused by the submit event."
- "Split the keyed inner form so changing `contact.id` resets all form state."
- "Kept the fetch Effect, but added stale-response cleanup and error handling."

For code review findings, prioritize real bugs: stale renders, double submits, race conditions, accidental remount behavior, parent/child render cascades, and state that can get out of sync.

## Quick Checklist

Before finishing React work, verify:

- No Effect exists solely to update state from props/state.
- No user action is represented as temporary state just so an Effect can act on it.
- No parent callback is called from an Effect when the child already knows the event that caused the change.
- Reset-on-identity-change uses a `key` where full subtree reset is intended.
- Selected entities are stored as IDs when possible, not duplicated objects.
- Expensive pure calculations are either measured and memoized, or isolated by component boundaries.
- Remaining Effects have a named external system and cleanup where needed.
- Fetching Effects cannot apply stale responses after params change or unmount.
