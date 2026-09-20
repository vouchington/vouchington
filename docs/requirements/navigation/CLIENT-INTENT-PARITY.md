# Client Intent Parity

Web, Swift, and .NET expose the same product intent structure with platform-native chrome:

- Web shows intents in the header switcher and sidebar.
- Swift and .NET show product intents in native bottom/tab navigation.
- Staff-only intents are role-gated native directories, not WebView fallbacks.

The machine-readable contract is [`client-intent-parity.json`](client-intent-parity.json). Its
source of truth is the web `NAV_INTENTS` registry at
[`web/lib/navigation/intents/nav-intents.ts`](../../../web/lib/navigation/intents/nav-intents.ts).
When a feature surface moves, coordinate linked Vouchington and
[`vouchington/vouchington-clients`](https://github.com/vouchington/vouchington-clients) PRs:
Vouchington stages the web and `api-fixtures/v1` contract, then the client PR consumes and validates
that staged contract. Record the linked PRs and handoff rather than requiring impossible
cross-repository edits in one PR.

This contract describes where an intent appears and who can see it. It does not establish that the
intent's workflows are functionally complete. Capability status and source/test evidence live in
the [client feature parity contract](../client-feature-parity.json).

## Contract Rules

- Every web `NavIntentId` must appear in the client intent contract with the same label, auth gate,
  and role gate.
- Native clients may group related web intents under one section only when the contract names that
  mapping explicitly. For example, chat and messages both live under the native Messages section.
- Signed-out users see only intents with `requiresAuth: false`; signed-in users additionally see
  member intents; staff/admin users additionally see matching role-gated staff directories.
- Public `/user/:idOrUsername` profile routes belong to the `friends` intent but remain anonymous
  destinations. Native route resolution may exempt these destinations from the intent's auth gate
  without exposing the signed-in Friends shell or any `/my/*` route to signed-out users.
- Feature-flagged intents include a `featureFlag` property. Clients keep the intent in their
  catalog for parity but hide it unless the flag is enabled.
- User-facing and staff-facing API response changes must stage shared fixtures in Vouchington, then
  update both native API clients in the linked client-repository PR. Shared endpoint fixtures should
  include an `api-fixtures/v1` `route` contract when a client is expected to cover the
  method/path/query/body builder.

## Related

- [Client Parity Matrix](../CLIENT-PARITY-MATRIX.md) — functional-UI companion to this intent
  contract; tracks what users can actually _do_ on each native client vs. web
- [Client feature parity contract](../client-feature-parity.json) — machine-readable capability
  status, evidence, and active shared gap ownership
- [Navigation](NAVIGATION.md)
- [App Navigation](APP-NAVIGATION.md)
- [Signed-out Actions](SIGNED_OUT_ACTIONS.md)
