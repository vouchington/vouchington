Reconcile pending native adoption against `vouchington/vouchington-clients` main. Run in PR mode, with at most one producer PR removing verified adopted flags and one deduplicated clients issue for aged unreferenced items. A completed audit with neither change is a verified no-op. Do not add a required check, delete unused copy or fixtures, or implement client features.

Producer changes land before client adoption and stay backward compatible with released clients.
Pending metadata keeps adoption gaps visible without coupling merge order. See the owning
[native localization](../../development/reference-tests-translation-catalog-and-locale-checks.md)
and [API fixture](../../development/testing/backend/api-fixtures.md) pages.

## Evidence

1. Record the exact producer and clients main SHAs. Read the clients `contracts/vouchington.json` producer pin and inspect client sources at that same SHA. An unresolved pin or unavailable source makes the audit incomplete; missing evidence is never an unreferenced item.
2. Inventory `pending: true` claims in the native-consumer manifest slices and fixture cases in `backend/test-helpers/api-fixtures/` (including the exported manifest), by canonical claim key and fixture ID. Do not touch pending flags in other open PRs.
3. Verify adoption per declared native consumer against actual client-main references, using the existing native source-discovery and usage rules for copy (including normalized variants) and the Swift/.NET fixture-coverage registrations for fixtures. Generated resources, copied manifests, comments, docs, or an ID present only in the producer corpus prove nothing.
4. A shared claim's flag may be removed only when every claimed consumer references the key; a fixture's flag only when all its declared native consumers adopted it. Partial adoption keeps the flag and names the missing consumer. A fixture with no native consumer is out of scope.

## Producer PR

Remove at most 50 flags per run, in stable key/ID order, only the `pending` property, preserving keys, consumers, translations, bodies, and schemas; regenerate fixture output. Report remaining eligible items. Do not clear flags merely for age. Before publishing, refresh clients main and its pin and revalidate every selected reference. Validate with the owning commands in [Tests](../../development/tests.md). This prompt grants no merge authority.

## Aged unreferenced items

For each still-unreferenced native consumer, establish from producer Git history when the current pending interval began (the property's introduction, including moves or re-additions, not formatting-only blame); report unknown age without calling it overdue. Items pending more than 30 days go into one grouped issue in `vouchington/vouchington-clients` with the missing consumers, introduction commit/date, and current client-main evidence. Never open a PR to delete them.

This prompt alone may create or materially update that issue, through the `github-issue` skill and the live clients taxonomy, with the marker:

`<!-- native-pending-adoption: vouchington/vouchington -->`

Search open and closed clients issues and PRs for the marker, exact keys/IDs, and equivalent adoption work first. Update an open match only when the item set or evidence materially changes; link existing feature issues rather than duplicating them; a closed match permits a new issue only for materially distinct items. At most one issue per run; never close, reopen, or retaxonomize.

Report the audited SHAs and pin, removals and deferred candidates, issue disposition, and the wrapper's outcome. A completed audit with no producer patch is a verified no-op for the PR outcome, with any issue mutation reported separately.
