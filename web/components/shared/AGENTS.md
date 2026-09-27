# Shared components

- Before changing TopicAutocomplete/EntityAutocomplete, read [async client state](../../../docs/requirements/navigation/reference-components-patterns.md#async-client-state) and [topic reference fields](../../../docs/requirements/content/reference-topics-topic-types.md#reference-fields).
- Mutations changing selected underlying values change autocomplete `key` to force remount; parent selection changes clear invalid dependent child fields.
- Abort superseded searches or compare request tokens; never display stale async results.
- Derive `topicTypes` from `topicReferenceFieldTypes` in `web/components/topics/settings/topic-edit-model.ts`, never array literals at call sites; the prop is a UX filter, not backend validation.
- `minQueryLength={0}` focuses into `search('')` browsing only for small caller-scoped collections, never large unscoped/global indexes.
- Multi-select accumulation uses `closeOnSelect={false}` and toggles membership in `onSelect`; retain selected results/checkmarks instead of client-side exclusion filters. Single-value fields keep default close-on-select behavior.
