Reconcile pending native adoption against `vouchington/vouchington-clients` main. Run in PR mode,
with at most one producer PR removing verified adopted flags and one deduplicated clients issue
for aged unreferenced items. A completed audit with neither change is a verified no-op. Do not add
a required check, delete unused copy or fixtures, or implement client features.

Additive producer changes may land before client adoption. Pending metadata keeps adoption gaps
visible without coupling merge order; only breaking contract changes need lockstep. See the owning
[native localization](../../development/reference-tests-translation-catalog-and-locale-checks.md)
and [API fixture](../../development/testing/backend/api-fixtures.md) pages.

## Evidence and scope

1. Resolve and record exact producer and clients main SHAs. Read the clients main
   `contracts/vouchington.json` producer pin and the pinned contract, then inspect client sources
   at that same clients SHA. An unresolved pin or unavailable source makes the audit incomplete;
   never treat missing evidence as an unreferenced item.
2. Inventory `pending: true` claims in the producer's native-consumer manifest slices and fixture
   cases in `backend/test-helpers/api-fixtures/`. Use canonical claim keys and fixture IDs, not
   generated identifiers alone. Inspect the exported fixture manifest as well as its case sources.
   Do not change pending flags in other open PRs or label unrelated items pending.
3. Verify adoption for each declared native consumer against the contract available at the client
   pin and actual client-main references. For copy, trace product Swift/.NET key references using
   the existing native source-discovery and usage rules, including normalized message variants.
   For fixtures, trace IDs to the owning Swift/.NET executable fixture-coverage registrations and
   their callers. Generated resources, copied manifests, comments, docs, or an ID present only in
   the producer corpus do not prove adoption.
4. A shared claim's flag may be removed only when every consumer it claims references the key.
   A fixture's flag may be removed only when all its declared native consumers have adopted it;
   retain non-native consumers and all other fixture metadata. If no native consumer is declared,
   report it outside this audit's scope. Partial adoption leaves the flag in place and identifies
   the missing consumer in the evidence record.

## Producer PR

Select adopted pending items in stable key/ID order, removing at most 50 flags per run in one
independently mergeable PR. Report any remaining eligible items for a later run. Remove only the
`pending` property from canonical claim entries or fixture cases; preserve keys, consumer lists,
translations, response bodies, and schemas. Regenerate fixture output when case metadata changes.
Do not clear flags merely because they are old, and do not add a stale-flag CI check.

Before publication, refresh clients main and its pin and revalidate every selected reference. If
the evidence changed, reassess those items before pushing. Validate through the owning test and
generation commands in [Tests](../../development/tests.md) and the fixture runbook. Keep the PR
bounded to pending metadata and its generated output. Follow the scheduled wrapper's existing-PR
ownership and concurrent-head protections. Shared development tooling still needs the owner's OK
to merge; this prompt grants no merge authority.

## Aged unreferenced items

For each still-unreferenced native consumer, establish when the item's current pending interval
began from producer Git history. Use the pending property's introduction, including moves or
re-additions, rather than the original copy/fixture age or a formatting-only blame date. Report
unknown age without classifying it as overdue. At more than 30 days pending, include the item,
missing consumers, introduction commit/date, and current client-main evidence in one grouped issue
in `vouchington/vouchington-clients`. Never open a PR to delete those items.

This prompt alone has the scheduled wrapper's narrow authorization to create or materially update
that issue. Use the [GitHub issue workflow](../../../.agents/skills/github-issue/SKILL.md) and live
clients taxonomy. Use this stable issue-body marker:

`<!-- native-pending-adoption: vouchington/vouchington -->`

Search open and closed clients issues and linked PRs for the marker, exact keys/IDs, and equivalent
adoption work before mutating. Update an existing open matching issue only when the item set or
evidence materially changes; do not post unchanged audit comments or duplicate work already tracked
by feature issues. Link those existing issues from the grouped report. A closed match permits a
new issue only for materially distinct active items, with a link explaining the difference. Create
or update at most one issue per run; do not close, reopen, or retaxonomize issues. If no new aged
gap is verified, leave issues unchanged.

Report the exact audited SHAs/pin, removals and deferred candidates, issue disposition, validation
results, and the scheduled wrapper's completion outcome. An issue-only maintenance result needs no
log-only producer PR; a fully completed audit with no producer patch is a verified no-op for the
PR outcome, with its issue mutation reported separately.
