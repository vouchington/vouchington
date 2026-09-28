# Client Parity Matrix

This document summarizes **rendered, functional UI parity** across web, Swift, and .NET. The
machine-readable source of truth is
[client-feature-parity.json](client-feature-parity.json); every summary row below maps to one or
more capability records in that contract.

A route, endpoint, response type, or navigation catalog entry is not UI evidence. A rendered native
status requires a real presentation path, and every native `full` claim requires an executable
behavioral test or an explicitly declared source-audit test. A source audit verifies UI wiring when
framework-owned code cannot execute directly; it is not behavioral evidence. The native evidence
paths in `client-feature-parity.json` are relative to
[`vouchington/vouchington-clients`](https://github.com/vouchington/vouchington-clients), while web
paths remain relative to Vouchington. The client repository validates those native paths and consumes
the staged Vouchington fixture contract; Vouchington retains the matrix and checks navigation/table
coverage rather than asserting that an external checkout has tracked files. Both repositories keep
active Table C issues synchronized so a full summary row cannot hide a lower-level native mismatch.

Historical `[#N]` identifiers in the matrix are archival provenance from the predecessor tracker.
They deliberately remain plain text: the identifiers retain their evidence context without exposing
or implying a public destination for predecessor issues or milestones.

Lifecycle parity is additionally executable through the stable scenario IDs in
[`api-fixtures/v1/lifecycle-scenarios.json`](../../api-fixtures/v1/lifecycle-scenarios.json). The
[fixture authoring guide](../development/testing/backend/api-fixtures.md#lifecycle-scenario-contract)
defines the required claim and adapter workflow. Moderation operations, integrity actions, and
saved/bookmark capabilities cite platform runners that consume that shared contract.

See also:

- [Native Client Strategy](../overview/architecture/native-clients.md)
- [Client Intent Parity](navigation/CLIENT-INTENT-PARITY.md)
- [Native Parity Interactions](../checklists/native-parity-interactions.md)
- [Entity × Action Matrix](ENTITY-ACTION-MATRIX.md)
- [Entity × Lifecycle Flow Matrix](ENTITY-LIFECYCLE-MATRIX.md)
- [User profiles and friend recommendations](users/USERS.md)
- [User settings and financial workflows](users/USER_SETTINGS.md)
- [Notification behavior and preferences](navigation/NOTIFICATIONS.md)
- [Localization](users/LOCALIZATION.md)
- [Bookmarks Catalog](content/BOOKMARKS-CATALOG.md)

## Contents

- <a id="legend"></a>[Legend](reference-client-parity-matrix-legend.md)
- <a id="table-a--cross-cutting-capabilities"></a>[Table A — Cross-Cutting Capabilities](reference-client-parity-matrix-table-a-cross-cutting-capabilities.md)
- <a id="table-b--domain-surfaces"></a>[Table B — Domain Surfaces](reference-client-parity-matrix-table-b-domain-surfaces.md)
- <a id="table-c--active-gaps-and-synchronization-rule"></a>[Table C — Active Gaps and Synchronization rule](reference-client-parity-matrix-table-c-active-gaps.md)

## Bounded story article handoff

Vouchington stages `story_member_pages` in feed, search, and community responses and the
`native.stories.get.default` / `native.stories.get.after` shared fixtures before the linked
`vouchington/vouchington-clients` PR consumes them. A preview contains related members only. Web,
Swift, and .NET keep the first direct primary and its opaque cursor when a story repeats on a later
feed page; shared deliveries stay standalone. Expansion renders the prefetched articles without a
request, and explicit continuation appends up to 25 articles with the original primary excluded.
Loaded rows, media, and actions stay present during loading or retry. The linked native
[draft PR #183](https://github.com/vouchington/vouchington-clients/pull/183)
remains draft until this producer contract reaches `main`, then its staged fixture and localization
checks pass. Existing producer/client localization cleanup tracked by Vouchington
#854 and
[vouchington-clients#166](https://github.com/vouchington/vouchington-clients/issues/166) currently
blocks the native exporter independently of these story fixtures.

## Push generation handoff

Vouchington owns the API fixture and generated web client contract for push subscription generations.
Browser clients that own a worker push binding send its exact endpoint and subscription ID on
logout, and treat a worker binding mismatch as disabled. Native clients do not own that browser
state and continue using the supported no-body logout request. Deploy the server migration and
generated contract before releasing a client that adopts the optional logout binding.

## Copyright claimant attribution handoff

Vouchington stages the required nullable claimant public-profile contract in the web API fixtures.
Web consumes it now. Swift and .NET consumption remains deferred to #853 and #854; native clients
must not infer a legal identity from the nullable profile.

### Media placement contract handoff

`api-fixtures/v1` now stages immutable image placement tuples for every persisted public image
surface: user avatars, topic logos and heroes, community profile and banner images, and profile-link
images. The tuple is `{ placement_id, placement_revision, image_id }`; clients must build public
image routes only from that tuple and must not reconstruct a generic route from `image_id`.
The tuple is absent while delivery projection is pending or withheld, so clients render no persisted
image in that state. The linked `vouchington/vouchington-clients` change must consume the generated
fixtures and update its DTOs and renderers before native release; it must not treat `image_id` as a
browser-delivery capability.

### API-key and connected-app contract handoff

Vouchington stages the scope-catalogue, API-key creation and OAuth-grant fixtures before native
consumers adopt them. The catalogue is authoritative for credential surface, audience,
prerequisite and description-key behavior. Swift and .NET filter it rather than copying scopes,
preserve explicit selection for exact-grant permissions, and resolve description keys through
their localization catalogues. Their connected-app surfaces paginate active grants, distinguish
consent from nullable last use, and retain truthful state when revocation fails. Developer-owned
OAuth app management and administrator verification remain web-only. Native delivery is tracked by
[vouchington-clients#177](https://github.com/vouchington/vouchington-clients/issues/177).

### Client ID Metadata Document boundary

Native OAuth coordinators open the hosted browser flow rather than render consent copy. Client ID
Metadata Document consent name and hostname changes therefore remain in that hosted browser
surface and do not change native REST DTOs or fixture consumers. A discovered native DTO or
consumer change requires the normal linked client validation PR.
