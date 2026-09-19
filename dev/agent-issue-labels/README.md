# Batch GitHub issue preflight

[Back to Dev Environment Reference](../README.md#github-issue-tooling)

`batch-issues.mts` validates a batch of proposed Vouchington issues from one manifest. It fetches the
live label and milestone taxonomy once and preflights every entry fail-closed. It never creates or
mutates an issue. Run each approved write separately through the
[github-issue skill](../../.agents/skills/github-issue/SKILL.md), which revalidates repository
authority immediately before the mutation and reads the result back.

## Scope (v1)

Batch preflight validates **plain issues only**, in **`vouchington/vouchington` only** — `targetRepo` must
be exactly that string, or `parseManifest` throws before any `gh` call is made. There is no
multi-repo support anywhere in this tool. `Plan:` issues, epics, sub-issues, and `blocked-by`
relationships are out of scope and go through the one-at-a-time skill flow.

Issue [#8152](https://github.com/vouchington/vouchington/issues/8152), which this tool implements,
originally asked for "mixed-repository" test coverage. That criterion doesn't apply under the
single-repo-only design above, so the test suite covers a **mixed-classification** batch instead —
one preflight run with an entry combining a milestone and the `dependencies` label alongside a
separate plain entry, both passing together (`__tests__/batch-preflight.test.mts`).

Each manifest entry accepts an optional `dependencies: string[]` field listing the dependency
names the issue is about. A non-empty list auto-adds the `dependencies` label to the entry's
resolved labels — the same caller-required-label rule
[`## New-Issue Classification`](../../.agents/skills/github-issue/SKILL.md#new-issue-classification)
applies one issue at a time. It is **not wired to any GitHub-native relationship** in v1 — no
`addBlockedBy` call is made from it, so a future version can translate the same field into real
dependency edges without a manifest schema change.

## Session directory contract

All batch state for one run lives in a single directory, created once by the caller:

```
${TMPDIR:-/tmp}/gh-issue-batch-<session-id>/
  manifest.json           # agent-authored
  body-<id>.md             # agent-authored, reviewed body per entry
  preflight-report.json   # written by `preflight`
```

The command takes `--session-dir <path>` and reads/writes exclusively inside it —
`bodyFile` paths in the manifest are resolved relative to `--session-dir`, and there is no
internal `mkdtemp` that could orphan artifacts. After fixing a manifest problem, rerun `preflight`
to replace the report.

## Manifest schema (`manifest.json`)

```jsonc
{
  "targetRepo": "vouchington/vouchington", // must be exactly this string
  "entries": [
    {
      "id": "e1", // unique; must match ^[A-Za-z_][A-Za-z0-9_]*$
      "title": "Short imperative title",
      "bodyFile": "body-e1.md", // relative to --session-dir; reviewed bytes
      "paths": ["dev/agent-issue-labels/"], // drives labeler.yml-derived labels + an existence check
      "priority": "priority: medium", // exactly one of the four canonical priority strings
      "milestone": null, // optional; must be an OPEN milestone title, or null
      "extraLabels": [], // optional; additional explicit labels from the live taxonomy
      "dependencies": [], // optional; non-empty => auto-adds the 'dependencies' label (see Scope)
      "duplicateSearch": {
        // optional; defaults to { query: title, acknowledgedHits: [], acknowledgedSiblings: [] }
        "query": "batch preflight manifest github issue", // 3-5 keywords; defaults to title
        "acknowledgedHits": [], // existing issue #s reviewed and judged non-duplicate
        "acknowledgedSiblings": [], // other entry ids in this manifest that are intentional near-dups
      },
    },
  ],
}
```

`id` remains identifier-safe so reports and future read-only tooling can address entries without
escaping or ambiguous keys.

## Subcommands

```bash
node --experimental-strip-types dev/agent-issue-labels/batch-issues.mts \
  preflight --session-dir <dir> --repo <owner/repo>
```

- **`preflight`** — fetches the live taxonomy once, then evaluates every entry and writes
  `preflight-report.json`. Never short-circuits: every safeguard runs for every entry, so one
  report surfaces every blocking problem across the whole batch at once. Exits nonzero if any
  entry is blocked.

`preflight` is the only supported mode. Mutation and post-mutation modes are intentionally absent;
the canonical issue workflow owns those boundaries one issue at a time.

## Preflight fail-closed guarantee

Preflight blocks an entry — and therefore the whole batch report — for any of:

- a resolved label not present in the live taxonomy (`unknown-label`)
- more than one resolved label starting with `priority:` (`duplicate-priority`)
- a milestone not present in the live open-milestone list (`unknown-milestone`)
- a manifest `paths` entry that does not exist on disk (`missing-paths`)
- a `bodyFile` that cannot be read, or that reads as empty/whitespace-only (`body-unreadable`)
- every `gh issue list --search duplicateSearch.query` hit whose issue number is **not** listed in
  `duplicateSearch.acknowledgedHits` (`duplicate-existing`) — `gh` search returns related, not only
  duplicate, issues, so an unacknowledged hit always blocks; there is no similarity-threshold
  auto-pass
- a likely duplicate of another entry in the same manifest, by title similarity, unless both
  entries list each other's id in `duplicateSearch.acknowledgedSiblings` (`duplicate-in-batch`) — a
  one-sided acknowledgment does not suppress the block

This tool **never creates labels or milestones** — a resolved label or milestone that is not
already in the live taxonomy is reported as taxonomy drift and blocks the entry, the same rule the
[github-issue skill](../../.agents/skills/github-issue/SKILL.md) applies one issue at a time.

## Bounded `gh`-call budget

- `preflight`: exactly `3 + N` calls for an N-entry manifest — one `gh auth status`, one label
  list, one milestone list, and one duplicate search per entry.

The helper performs no write calls. The canonical one-at-a-time workflow deliberately refetches
authority and verifies metadata around every mutation.

## Reuse

- [`labels-from-paths.mts`](labels-from-paths.mts) — the same path → component-label derivation
  the one-at-a-time skill flow uses, imported directly rather than reimplemented.
- `dev/plan-issue.mts`'s dependency-injection + `import.meta.url` main-guard structure is the
  template every module here follows: pure logic (`batch/manifest.mts`, `batch/intra-dedup.mts`,
  `batch/resolve-entry.mts`) is separated from IO-driving orchestration (`batch/preflight.mts`), and
  every IO dependency (`runGh`, `pathExists`, `readBody`, `writeArtifact`) is injected so tests
  never mock an internal module.
