# UI Components reference

[Back to UI Components](COMPONENTS.md)

## Entity Reference Inputs

Any form field where the user selects another entity (topic, user, etc.) by its database ID must use an autocomplete picker — `TopicAutocomplete`, `UserAutocomplete`, or `EntityAutocomplete` — never a plain `<Input>` that asks the user to type or paste a raw ID or UUID.

The pattern is enforced by the `web-no-id-text-input` ast-grep rule, which flags:

- Any element with a `placeholder` or `aria-label` attribute whose value ends with ` ID` or ` UUID` (e.g. `placeholder='Company topic ID'`, `aria-label='User UUID'`).
- Any `<Label>` or `<FormLabel>` whose text content ends with ` ID` or ` UUID` (e.g. `<Label>Bank ID</Label>`, `<Label>Entity UUID</Label>`).

The rule is scoped to `web/**` and excludes `web/components/ui/`, test files, and story files. Reference implementation: `web/components/topics/settings/type-attributes-section.tsx` (TopicAutocomplete per field) and `web/components/topics/settings/merge-client.tsx`.
