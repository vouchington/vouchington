# Shared Components

Cross-feature UI primitives. The async topic/entity autocompletes live here
(`entity-autocomplete.tsx`) and in `web/components/posts/topic-autocomplete.tsx`.

## Async autocomplete invariants

Before replacing an input with `TopicAutocomplete` or `EntityAutocomplete`, read
[Async Client State](../../../docs/requirements/navigation/reference-components-patterns.md#async-client-state) and
[Topic reference fields](../../../docs/requirements/content/reference-topics-topic-types.md#reference-fields), then preserve:

- **Force-remount after a mutation.** After a mutation that changes the underlying value
  (e.g. granting/creating the referenced entity), give the autocomplete a `key` that changes
  so it remounts. A controlled autocomplete otherwise keeps showing stale text from before
  the mutation.
- **Clear dependent fields when the parent changes.** When a parent autocomplete selection
  changes, reset any child fields whose validity depends on it — do not leave a now-orphaned
  child id selected.
- **Guard against stale async responses.** On rapid input, an earlier in-flight request can
  resolve after a later one. Abort superseded requests (or tag/compare a request token) so the
  last keystroke wins; never render results from a superseded fetch.
- **Derive any `topicTypes` filter from `topicReferenceFieldTypes`.** The `topicTypes` prop is a
  UX affordance, not a backend contract. Read the allowed types from
  `web/components/topics/settings/topic-edit-model.ts` → `topicReferenceFieldTypes`; never
  hand-pass an array literal at the call site.
- **`minQueryLength={0}` browses before typing.** With the default `minQueryLength`, `search()`
  only runs once the user has typed. Passing `0` also fires `search('')` on focus, so the
  dropdown shows an initial page of results before any keystroke — use this for pickers over a
  small, caller-scoped collection (e.g. `follower-send-picker.tsx` searching only the current
  user's own followers, never a global user search) rather than a large unscoped index.
- **`closeOnSelect={false}` is for multi-select accumulation.** The default (`true`) closes the
  dropdown after `onSelect`, which fits single-value fields. A picker that toggles multiple
  selections into external state (checkmark-in-list UX, e.g. `follower-send-picker.tsx`) should
  set `closeOnSelect={false}` and let `onSelect` toggle membership instead of replacing a value;
  do not layer client-side exclusion filtering of already-selected items into the search results
  for this pattern — the toggle-in-list checkmark communicates selection state without it.
