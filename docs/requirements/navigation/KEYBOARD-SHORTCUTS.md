# Keyboard Shortcuts

## Shortcuts

| Action         | Key | Modifier | Auth Required | Notes                           |
| -------------- | --- | -------- | ------------- | ------------------------------- |
| Open search    | K   | ⌘/Ctrl   | No            | Opens command search dialog     |
| Toggle sidebar | /   | ⌘/Ctrl   | No            | Expands/collapses the sidebar   |
| Open settings  | .   | ⌘/Ctrl   | Yes           | Navigates to `/my/preferences`  |
| Show shortcuts | ?   | None     | No            | Opens keyboard shortcuts dialog |

## Moderation Queue Shortcuts

These shortcuts are scoped to moderation queue surfaces and do not run while typing in form fields.

| Action                       | Key | Surface                                  | Notes                                           |
| ---------------------------- | --- | ---------------------------------------- | ----------------------------------------------- |
| Next queue item              | J   | Community mod queue, staff reports queue | Moves the active item down without wrapping     |
| Previous queue item          | K   | Community mod queue, staff reports queue | Moves the active item up without wrapping       |
| Approve post                 | A   | Community mod queue                      | Approves the active pending post                |
| Remove post / review report  | R   | Community mod queue, staff reports queue | Removes active pending posts; reviews reports   |
| Dismiss report               | D   | Community mod queue, staff reports queue | Dismisses the active report                     |
| Toggle active item selection | X   | Community mod queue, staff reports queue | Selects/deselects; bulk actions remain explicit |
| Show moderation shortcuts    | ?   | Community mod queue, staff reports queue | Opens the scoped moderation shortcuts dialog    |

## Implementation

- All modifier shortcuts use `(event.metaKey || event.ctrlKey)` for cross-platform support.
- Cmd+K and Cmd+. listeners are attached with the capture flag (`true`) so they run before other handlers and can prevent browser defaults (Safari uses Cmd+. as Stop).
- Cmd+/ is handled inside `SidebarProvider` (`web/components/ui/sidebar.tsx`) via the `SIDEBAR_KEYBOARD_SHORTCUT` constant.
- Cmd+K and Cmd+. are registered in `web/components/navbar.tsx`.
- The `?` shortcut checks `isInputTarget()` from `web/lib/keyboard-shortcuts.ts` to avoid capturing keystrokes in form fields.
- Moderation queue shortcuts use `useModerationQueueHotkeys()` and the same `isInputTarget()` guard. The queue-local `?` listener runs in capture phase and stops propagation so the global shortcut dialog does not also open.
- Platform display (⌘ vs Ctrl) is detected client-side via `navigator.userAgent` and stored in `isMac` state.
- The shortcuts dialog component is code-split with `next/dynamic`.

## Central Registry

All shortcuts are defined in `web/lib/keyboard-shortcuts.ts`:

- `KEYBOARD_SHORTCUTS` array — single source of truth for the dialog, the page, and tests
- `MODERATION_QUEUE_SHORTCUTS` array — scoped moderation queue shortcut definitions
- `isInputTarget(event)` — returns true for INPUT, TEXTAREA, SELECT, or contenteditable elements
- `formatShortcut(shortcut, isMac)` — returns the platform-aware display string (e.g. `⌘K` or `Ctrl+K`)

## Pages

- `/article/keyboard-shortcuts` — public, SEO-indexed reference article listing all shortcuts
- `/keyboard-shortcuts` — permanent redirect to `/article/keyboard-shortcuts`
- Source: `articles/keyboard-shortcuts.md`
- The page is also discoverable via the command palette (⌘K → type "keyboard")

## Related

- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions

- [docs/requirements/navigation/ACCESSIBILITY.md](./ACCESSIBILITY.md)
- [docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md](../users/ACCOUNT-DELETION-DATA-REQUEST.md)
