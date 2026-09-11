# Native Parity Interactions

Use this checklist when a Swift or .NET change touches a user-facing native interaction surface:
lists, detail views, tab switches, load-more flows, notification targets, media controls, streaming
chat/support flows, analytics panels, security-sensitive transport, or role-gated navigation.

## Check

- Update the relevant rows in [Client Parity Matrix](../requirements/CLIENT-PARITY-MATRIX.md)
  whenever the user can do more or less than before.
- Update the matching entries in the machine-readable
  [client feature parity contract](../requirements/client-feature-parity.json). A `full` claim
  requires rendered UI evidence plus an executable behavioral test for each native client. When
  framework-owned UI code cannot execute directly in a test, an explicitly declared source-audit
  test may verify the UI wiring instead. Source-audit tests are not behavioral evidence and must
  never be described as such. Route or API coverage alone is `plumb`, not functional parity. Every
  native status below the mapped web status, including `read` and `present`, needs one active issue
  shared by Swift and .NET.
- Keep [Client Intent Parity](../requirements/navigation/CLIENT-INTENT-PARITY.md) aligned with the
  Swift `AppSection` map and .NET navigation catalog, including anonymous, signed-in,
  administrator, investor, and moderator visibility.
- Before declaring a surface at parity, trace every displayed or actionable field through the full
  native handoff: API response or `api-fixtures/v1` fixture -> Swift model / .NET DTO -> view model
  or row factory -> final SwiftUI / XAML binding. Record test or inspection evidence at each
  handoff; endpoint coverage or successful decoding alone does not establish UI parity.
- For paginated lists, test first page, cursor forwarding, load-more append, duplicate in-flight
  guards, cancellation, and failure preservation for already-rendered rows. Follow the canonical
  API and state contract in [Cross-Surface Cursor Pagination](../overview/architecture/pagination.md).
- When behavior belongs to a family in
  [`lifecycle-scenarios.json`](../../api-fixtures/v1/lifecycle-scenarios.json), claim the stable ID
  with the platform adapter and compare a production-boundary observation with the shared expected
  value. Never pass `expected` into the adapter.
- For optimistic actions, test success, rollback, stale request/session handling, and disabled
  states while a mutation is in flight.
- For route targets, test exact route scope, parameter/query preservation, native-vs-external URL
  activation, and role/auth gates before dispatch.
- For media surfaces, test resume position, progress persistence, completion behavior, chapter or
  seek jumps, and the fallback boundary: link-only audio may open externally, while embed-only
  video must display unavailable and keep its separate Open source action external.
- For streaming or async flows, test partial chunks, terminal errors, cancellation, retry, and stale
  response isolation.
- For analytics panels, test stale-response rejection and partial failure behavior so one failed
  request does not remove unrelated visible content.
- For transport/security behavior, keep native TLS pinning and custom/local-origin bypass rules in
  sync with [Native TLS Pinning](../runbooks/native-tls-pinning.md).
- Keep parity native. Do not add WebView, embedded web, or open-web fallback for user-facing parity
  unless the accepted plan documents the blocker and a follow-up issue.

## Related

- [Native client strategy](../overview/architecture/native-clients.md)
- [Client feature parity contract](../requirements/client-feature-parity.json)
- [Documentation index](../README.md)
