# Client Parity Matrix

This document summarizes **rendered, functional UI parity** across web, Swift, and .NET. The
machine-readable source of truth is
[client-feature-parity.json](./client-feature-parity.json); every summary row below maps to one or
more capability records in that contract.

A route, endpoint, response type, or navigation catalog entry is not UI evidence. A rendered native
status requires a real presentation path, and every native `full` claim requires an executable
behavioral test or an explicitly declared source-audit test. A source audit verifies UI wiring when
framework-owned code cannot execute directly; it is not behavioral evidence. The native evidence
paths in `client-feature-parity.json` are relative to
[`vouchington/vouchington-clients`](https://github.com/vouchington/vouchington-clients), while web
paths remain relative to Filaments. The client repository validates those native paths and consumes
the staged Filaments fixture contract; Filaments retains the matrix and checks navigation/table
coverage rather than asserting that an external checkout has tracked files. Both repositories keep
active Table C issues synchronized so a full summary row cannot hide a lower-level native mismatch.

Lifecycle parity is additionally executable through the stable scenario IDs in
[`api-fixtures/v1/lifecycle-scenarios.json`](../../api-fixtures/v1/lifecycle-scenarios.json). The
[fixture authoring guide](../../backend/test-helpers/api-fixtures/README.md#lifecycle-scenario-contract)
defines the required claim and adapter workflow. Moderation operations, integrity actions, and
saved/bookmark capabilities cite platform runners that consume that shared contract.

See also:

- [Native Client Strategy](../overview/architecture/native-clients.md)
- [Client Intent Parity](./navigation/CLIENT-INTENT-PARITY.md)
- [Native Parity Interactions](../checklists/native-parity-interactions.md)
- [Entity × Action Matrix](./ENTITY-ACTION-MATRIX.md)
- [Entity × Lifecycle Flow Matrix](./ENTITY-LIFECYCLE-MATRIX.md)
- [User profiles and friend recommendations](./users/USERS.md)
- [User settings and financial workflows](./users/USER_SETTINGS.md)
- [Notification behavior and preferences](./navigation/NOTIFICATIONS.md)
- [Localization](./users/LOCALIZATION.md)
- [Bookmarks Catalog](./content/BOOKMARKS-CATALOG.md)

## Contents

- <a id="legend"></a>[Legend](reference-client-parity-matrix-legend.md)
- <a id="table-a--cross-cutting-capabilities"></a>[Table A — Cross-Cutting Capabilities](reference-client-parity-matrix-table-a-cross-cutting-capabilities.md)
- <a id="table-b--domain-surfaces"></a>[Table B — Domain Surfaces](reference-client-parity-matrix-table-b-domain-surfaces.md)
- <a id="table-c--active-gaps-and-synchronization-rule"></a>[Table C — Active Gaps and Synchronization rule](reference-client-parity-matrix-table-c-active-gaps.md)

## Push generation handoff

Filaments owns the API fixture and generated web client contract for push subscription generations.
Browser clients that own a worker push binding send its exact endpoint and subscription ID on
logout, and treat a worker binding mismatch as disabled. Native clients do not own that browser
state and continue using the supported no-body logout request. Deploy the server migration and
generated contract before releasing a client that adopts the optional logout binding.
