# UI Components reference

[Back to UI Components](COMPONENTS.md)

## Bookmark Buttons

### EntityBookmarkButton

`EntityBookmarkButton` (`web/components/shared/entity-bookmark-button.tsx`) renders a toggle button for a single bookmark predicate (follow, subscribe, mute, block, etc.) on any entity type.

**Cross-instance sync**: When multiple buttons share the same `(entityType, entityId)` pair (e.g. Follow + Subscribe + Mute + Block on a user profile), toggling one emits a `BookmarkChange` event (via `use-bookmark-invalidation.ts`) so sibling buttons for the **same predicate** can refetch and reflect updated server state. Buttons for different predicates are unaffected — the event handler filters by predicate, so toggling Subscribe does not cause Follow or Mute to refetch.

**Implicit-unfollow cascade**: Adding a mute or block bookmark causes the server to also remove the follow relation for certain entity types (`topic:mute/block`, `user:block`, `rss_feed:mute`, `community:proxy_mute`). The toggling button detects this via a client-side mirror of `backend/services/bookmarks/upsert.mts IMPLICIT_UNFOLLOW` and emits an additional `BookmarkChange` for the implicitly affected follow predicate, so the Follow button refetches and stays current.

## Radix UI footguns

### BubbleInput and `<form>` interaction

Radix `Select` (and other primitives that use an internal `BubbleInput`) dispatches a synthetic `change` event that bubbles through any ancestor `<form>` element. If the `Select` sits inside a `<form>` that has an `onSubmit` handler, that handler fires on every sort-select change — calling the update function twice.

**Fix:** render the `<form>` with `className='contents'` (CSS `display: contents`) and use a `form=` attribute on the text inputs so they associate with the form element without making the `Select` a descendant of the form DOM tree. See `web/components/shared/list-filters.tsx` for the canonical pattern.

**Regression guard:** `web/components/shared/__tests__/list-filters.mock.test.tsx` contains a test asserting `router.push` is called exactly once when the sort dropdown changes.

### Tooltip inside Dialog — ESC hijacking

Radix `Tooltip` inside a `Dialog` creates a nested `DismissableLayer`. Pressing ESC closes the tooltip first and the event does not propagate to close the dialog.

**Fix:** do not wrap icon buttons with `TooltipButton` inside dialogs unless the tooltip adds information not already in `aria-label`. Use a plain `aria-label` on the button; the `web-icon-button-tooltip` ast-grep rule accepts an explicit accessible name for these modal/dialog cases.

## Accessibility rules

- **Never add `aria-hidden="true"` to a focusable element** (button, link, input, or any element with `tabindex`). `aria-hidden` removes an element from the accessibility tree — on focusable elements this causes keyboard focus to land on an element that screen readers cannot describe. Use `aria-hidden` only on decorative, non-interactive elements such as `<kbd aria-hidden="true">` for keyboard shortcut hints.

- **Differentiate accessible names on sibling interactive elements** at design time. When two buttons in the same view perform different actions (e.g. "Follow source" and "Follow topic"), give them distinct `aria-label` values. Do not rely on visual position to distinguish them — screen readers and automated tests cannot use position.

- **Tooltip inside Dialog ESC footgun:** see the Radix UI footguns section above.

- **Displayed URLs must be clickable anchors.** Any URL string rendered for user consumption as an external-destination must use `<ExternalLink>` (`web/components/ui/external-link.tsx`), never plain text or a `window.open()` button. The ast-grep rule `web-no-window-open-navigation` enforces the `window.open` anti-pattern; see [external-link.tsx](../../../web/components/ui/external-link.tsx).

For Storybook a11y suppression patterns and `@storybook/addon-a11y` exception recipes, see [docs/development/tests.md § Storybook A11y Exceptions](../../development/tests.md#storybook-a11y-exceptions).

## Topic Autocomplete & Reference Fields

`TopicAutocomplete` / `EntityAutocomplete` are async autocompletes for selecting topics by id. A topic-reference field's allowed types come from `web/components/topics/settings/topic-edit-model.ts` → `topicReferenceFieldTypes` — the autocomplete `topicTypes` prop is a UX affordance, not a backend contract. See the field → type table in [TOPICS.md § Reference fields](../content/reference-topics-topic-types.md#reference-fields).

When swapping a plain text input for an async autocomplete (remount-after-mutation, clearing dependent fields, stale-response guards, deriving `topicTypes`), follow the checklist in [web/components/shared/CLAUDE.md § Swapping a text input → async autocomplete](../../../web/components/shared/CLAUDE.md).

## Related

- [docs/requirements/navigation/ACCESSIBILITY.md](./ACCESSIBILITY.md)
- [docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md](../users/ACCOUNT-DELETION-DATA-REQUEST.md)
