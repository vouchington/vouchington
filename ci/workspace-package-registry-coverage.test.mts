import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import picomatch from 'picomatch'
import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'

/**
 * Every top-level package is hand-registered in four places: `.syncpackrc.json` `source`,
 * `.github/ci-path-filters.yml`, `pnpm-workspace.yaml` `packages`, and (for wildcard package
 * globs) the `tooling:` CI group that runs this very test. None of those registries are derived
 * from git, so a new package, or a deleted one, can silently drift out of sync with what is
 * actually tracked. These assertions make that drift fail here instead of being found by hand.
 *
 * See https://github.com/jonathanong/filaments/issues/10977.
 */

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

type PathFilterGroups = Record<string, string[]>

function readYaml<T>(relativePath: string): T {
  return parseYaml(readFileSync(`${repoRoot}/${relativePath}`, 'utf8')) as T
}

const allTrackedFiles = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)

const trackedManifests = allTrackedFiles.filter(
  file => file === 'package.json' || file.endsWith('/package.json'),
)

const syncpack = readYaml<{ source?: string[] }>('.syncpackrc.json')
const ciPathFilters = readYaml<PathFilterGroups>('.github/ci-path-filters.yml')
const ciRuntimeFilters = readYaml<PathFilterGroups>('.github/ci-runtime-path-filters.yml')
const workspacePackages = readYaml<{ packages?: string[] }>('pnpm-workspace.yaml').packages ?? []

/**
 * The `tooling:` group's own catch-all exists solely to trigger this guard for every
 * manifest, including a brand-new one with no other registration at all — not to assert
 * that some real product/build/test group actually owns it. Counting it as "ownership"
 * would make that assertion vacuous: every manifest would trivially match it regardless
 * of whether deleting it from its true owning group (e.g. "playwright/package.json" from
 * "playwright:") left that manifest silently unmatched by any real CI job.
 */
const TOOLING_TRIGGER_ONLY_GLOB = '**/package.json'

/** `<workspace glob>/package.json`, the manifest path pattern a workspace entry stands for. */
function manifestGlob(workspacePattern: string): string {
  return `${workspacePattern.replace(/\/$/, '')}/package.json`
}

/**
 * Whether a `ci-path-filters.yml` entry looks like a manifest path rather than one of the
 * other fixed paths a group also carries (Dockerfiles, workflow files).
 */
function isManifestPath(entry: string): boolean {
  return entry === 'package.json' || entry.endsWith('/package.json')
}

/** Every `ci-path-filters.yml` entry across all groups, excluding TOOLING_TRIGGER_ONLY_GLOB. */
function allCiPathFilterEntries(): string[] {
  return Object.entries(ciPathFilters).flatMap(([name, globs]) =>
    name === 'tooling' ? globs.filter(glob => glob !== TOOLING_TRIGGER_ONLY_GLOB) : globs,
  )
}

/**
 * `.github/ci-runtime-path-filters.yml` pastes each primary group's positive globs into
 * one `{a,b,c}` brace-alternation item instead of separate list entries. Splitting any
 * fully-braced item back into its comma-separated members lets the two files' glob sets
 * compare equal regardless of that packaging difference (and regardless of order — the
 * pasted bundle does not always preserve the primary list's item order).
 */
function flattenBraceGlobs(globs: string[]): Set<string> {
  const flattened = new Set<string>()
  for (const glob of globs) {
    const braceMatch = /^\{(.*)\}$/.exec(glob)
    for (const member of braceMatch ? braceMatch[1].split(',') : [glob]) flattened.add(member)
  }
  return flattened
}

/**
 * Expands every `{a,b,c}` brace group in a glob-free (no `*`) entry into its literal path
 * alternatives, e.g. `backend/{api,config}/package.json` -> the two concrete paths. Only
 * meaningful for entries with no wildcard segment — those are still globs and can only be
 * checked by matching, not by literal lookup.
 */
function expandBraceAlternatives(pattern: string): string[] {
  const braceMatch = /\{([^{}]*)\}/.exec(pattern)
  if (!braceMatch) return [pattern]
  const [wholeMatch, alternatives] = braceMatch
  return alternatives
    .split(',')
    .flatMap(alternative => expandBraceAlternatives(pattern.replace(wholeMatch, alternative)))
}

describe('workspace package registry coverage', () => {
  it('matches every tracked manifest against a syncpack source glob', () => {
    const sourceGlobs = syncpack.source ?? []
    expect(sourceGlobs.length).toBeGreaterThan(0)
    // Tracked manifests missing from ".syncpackrc.json" "source" would show up here.
    const uncoveredBySyncpackSource = trackedManifests.filter(
      manifest => !picomatch.isMatch(manifest, sourceGlobs),
    )
    expect(uncoveredBySyncpackSource).toEqual([])
  })

  it('resolves every fixed syncpack source entry to a tracked manifest', () => {
    // A glob entry (containing "*") is covered by the forward assertion above; only a
    // fully fixed entry — including each alternative of a brace group with no "*" — can
    // drift silently when the manifest it names is deleted and the source entry is not,
    // since deleting a manifest removes nothing from the "trackedManifests" side above.
    const fixedSourceEntries = (syncpack.source ?? []).filter(entry => !entry.includes('*'))
    const staleFixedSourceEntries = fixedSourceEntries
      .flatMap(entry => expandBraceAlternatives(entry))
      .filter(manifest => !trackedManifests.includes(manifest))
    expect(staleFixedSourceEntries).toEqual([])
  })

  it('keeps every wildcard syncpack source entry matching a tracked manifest', () => {
    // Mirrors "expands every pnpm-workspace.yaml package glob to a tracked manifest" below:
    // when the last package matching a wildcard source such as "lambdas/*/package.json" is
    // deleted, the forward assertion above has no remaining manifest from which to detect the
    // stale entry, so this reverse direction is the only thing that catches it.
    const wildcardSourceEntries = (syncpack.source ?? []).filter(entry => entry.includes('*'))
    const deadWildcardSourceEntries = wildcardSourceEntries.filter(
      entry => !trackedManifests.some(manifest => picomatch.isMatch(manifest, entry)),
    )
    expect(deadWildcardSourceEntries).toEqual([])
  })

  it('matches every tracked manifest against a ci-path-filters.yml glob owned by a real CI group', () => {
    // Excludes the "tooling:" group's trigger-only catch-all (see TOOLING_TRIGGER_ONLY_GLOB)
    // so this stays a genuine ownership check: e.g. deleting "playwright/package.json" from
    // "playwright:" must fail here even though "tooling:" would still match it.
    // Tracked manifests owned by no ".github/ci-path-filters.yml" group would show up here.
    const uncoveredByCiPathFilters = trackedManifests.filter(
      manifest => !picomatch.isMatch(manifest, allCiPathFilterEntries()),
    )
    expect(uncoveredByCiPathFilters).toEqual([])
  })

  it('resolves every fixed ci-path-filters.yml manifest entry to a tracked manifest', () => {
    // Mirrors "resolves every fixed syncpack source entry to a tracked manifest" above: deleting
    // a manifest without also removing its literal ci-path-filters.yml entry (e.g. deleting
    // "playwright/package.json" but leaving it registered under "playwright:") leaves that entry
    // stale and invisible to the ownership assertion above, since the deleted manifest is absent
    // from "trackedManifests" on that assertion's other side. Scoped to entries that look like a
    // manifest path — every group also carries fixed non-manifest paths (Dockerfiles, workflow
    // files) this must not require to be a tracked manifest.
    const fixedManifestEntries = Object.values(ciPathFilters)
      .flat()
      .filter(entry => !entry.includes('*'))
      .flatMap(entry => expandBraceAlternatives(entry))
      .filter(isManifestPath)
    const staleFixedManifestEntries = fixedManifestEntries.filter(
      manifest => !trackedManifests.includes(manifest),
    )
    expect(staleFixedManifestEntries).toEqual([])
  })

  it('keeps every wildcard ci-path-filters.yml manifest entry matching a tracked manifest', () => {
    // Mirrors "keeps every wildcard syncpack source entry matching a tracked manifest" above:
    // when the last package matching a wildcard entry such as "lambdas/*/package.json" is
    // deleted, the ownership assertion above has no remaining manifest from which to detect the
    // stale entry, so this reverse direction is the only thing that catches it. Excludes the
    // "tooling:" group's trigger-only catch-all (see TOOLING_TRIGGER_ONLY_GLOB): it matches any
    // package.json by design and so can never go dead, which would make it a decorative case
    // here instead of a genuine liveness check.
    const wildcardManifestEntries = allCiPathFilterEntries()
      .filter(entry => entry.includes('*'))
      .filter(isManifestPath)
    const deadWildcardManifestEntries = wildcardManifestEntries.filter(
      entry => !trackedManifests.some(manifest => picomatch.isMatch(manifest, entry)),
    )
    expect(deadWildcardManifestEntries).toEqual([])
  })

  it('expands every pnpm-workspace.yaml package glob to a tracked manifest', () => {
    // "pnpm-workspace.yaml" "packages" globs matching no tracked manifest would show up here.
    const deadWorkspaceGlobs = workspacePackages.filter(
      workspacePattern =>
        !trackedManifests.some(manifest =>
          picomatch.isMatch(manifest, manifestGlob(workspacePattern)),
        ),
    )
    expect(deadWorkspaceGlobs).toEqual([])
  })

  it('has no negated pnpm-workspace.yaml package pattern', () => {
    // The reverse-coverage check below evaluates each "packages" pattern independently with
    // `.some()`. That cannot express pnpm's actual negation semantics (a "!foo" pattern excludes
    // manifests an earlier positive pattern matched — see
    // https://pnpm.io/pnpm-workspace_yaml#packages): picomatch.isMatch(x, '!foo') returns true
    // for nearly every x, so `.some()` would treat a negated pattern as matching everything and
    // never flag a manifest pnpm actually excludes. Fail loudly here instead of shipping that
    // silent gap — a real "!"-pattern needs the reverse check evaluated against the complete
    // positive-and-negative set, not per-pattern.
    const negatedWorkspacePatterns = workspacePackages.filter(pattern => pattern.startsWith('!'))
    expect(negatedWorkspacePatterns).toEqual([])
  })

  it('matches every non-root tracked manifest against a pnpm-workspace.yaml package glob', () => {
    // A manifest registered in Syncpack/ci-path-filters.yml but left out of "pnpm-workspace.yaml"
    // "packages" — silently excluded from pnpm workspace installs and recursive commands even
    // though every existing workspace glob still matches its old manifests — would show up here.
    // The root manifest is not itself a workspace member, so it is exempt. Assumes no negated
    // pattern exists (asserted above) — `.some()` cannot evaluate negation correctly.
    const nonRootManifests = trackedManifests.filter(manifest => manifest !== 'package.json')
    const manifestsUncoveredByWorkspacePackages = nonRootManifests.filter(
      manifest =>
        !workspacePackages.some(workspacePattern =>
          picomatch.isMatch(manifest, manifestGlob(workspacePattern)),
        ),
    )
    expect(manifestsUncoveredByWorkspacePackages).toEqual([])
  })

  it("mirrors every runtime path-filter group's positive globs against its primary group", () => {
    // .github/ci-runtime-path-filters.yml's own header says it plainly: the positive brace globs
    // "intentionally mirror the same-named primary filters" so that the trailing `!`-prefixed
    // lines are "the only refinement". Those exclusions are deliberate narrowing (e.g. storybook
    // ignores test-only edits that primary's broader `web:` gate still matches) — comparing
    // post-exclusion files against primary would fail by design, not by drift. What must stay in
    // sync is only the pasted-in positive bundle itself, since dorny has no way to reference
    // another file's group and a hand-copy can silently fall behind an edit to the primary group.
    //
    // Comparing declared glob strings, not which currently-tracked files they match, also catches
    // a primary glob added for a path nothing has been created under yet: file-matching would see
    // zero matches on both sides and miss the drift until a later file appears and only the
    // primary side picks it up.
    for (const [name, runtimeGlobs] of Object.entries(ciRuntimeFilters)) {
      // A runtime group naming a ".github/ci-path-filters.yml" group that does not exist would
      // fail here.
      const primaryGlobs = ciPathFilters[name]
      expect(primaryGlobs).toEqual(expect.any(Array))

      const positiveRuntimeGlobs = runtimeGlobs.filter(glob => !glob.startsWith('!'))
      // A declared positive glob present on one side but not the other — i.e. the pasted-in
      // positive bundle has drifted from an edit to the primary group — would show up here.
      expect(flattenBraceGlobs(positiveRuntimeGlobs)).toEqual(flattenBraceGlobs(primaryGlobs ?? []))
    }
  })

  it('keeps every wildcard workspace package glob reachable from the tooling group', () => {
    // A new package under an existing wildcard glob needs no pnpm-workspace.yaml edit, so it can
    // only be caught by a CI job that already runs on that PR. This guard lives in the tooling
    // Vitest project, gated by the `tooling:` group — so every wildcard glob must land inside it,
    // or a new package there would silently skip every assertion in this file. Wildcard globs not
    // covered by the "tooling:" group would show up here.
    const toolingGlobs = ciPathFilters.tooling ?? []
    const unreachableWildcardGlobs = workspacePackages
      .filter(workspacePattern => workspacePattern.includes('*'))
      .filter(workspacePattern => !picomatch.isMatch(manifestGlob(workspacePattern), toolingGlobs))
    expect(unreachableWildcardGlobs).toEqual([])
  })

  it('keeps every tracked manifest reachable from the tooling group', () => {
    // The check above only protects a *new* manifest under an existing wildcard glob. A fixed
    // manifest deleted without its registry entries (pnpm-workspace.yaml, .syncpackrc.json) also
    // being edited leaves no changed path inside "tooling:" at all, so this guard — which lives in
    // the tooling Vitest project — would never run on that PR and the stale entries would survive
    // undetected. Every tracked manifest, fixed or wildcard-sourced, must be reachable on its own.
    const toolingGlobs = ciPathFilters.tooling ?? []
    const manifestsUnreachableFromTooling = trackedManifests.filter(
      manifest => !picomatch.isMatch(manifest, toolingGlobs),
    )
    expect(manifestsUnreachableFromTooling).toEqual([])
  })
})
