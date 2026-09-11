#!/usr/bin/env node
// normalize-retry-artifact-directories.mts — strips a trailing "-retry" suffix off every
// immediate subdirectory of a downloaded-artifacts root.
//
// upload-coverage-pair and upload-vitest-report-attempt suffix their retry upload's artifact
// name with "-retry" (via the name-suffix input) so a same-attempt retry can never collide with
// an unfinalized ("zombie") upload left by the primary attempt. actions/download-artifact lands
// each matched artifact in its own subdirectory named after the artifact, so both consumers
// (coverage-check's preparePatchCoverageArtifacts, vouchington-tooling's
// readVitestReportAttempts) — which derive a suite from the literal directory name — would see
// an unrecognized "-retry"-suffixed directory unless it's renamed back first.
//
// Both actions' "Validate suite"/"Validate coverage suite" steps reject any suite name that is
// exactly "retry" or ends in "-retry", so a "-retry"-suffixed directory downloaded here can only
// be this suffix mechanism's own retry upload — never a legitimately named suite's own primary
// directory (e.g. a suite literally named "integration-retry"). The bare "retry" case is reserved
// too: a suite literally named "retry" would otherwise produce a primary directory (e.g.
// "coverage-retry") that still ends in "-retry", because the action's fixed artifact-name prefix
// ("coverage-"/"vitest-report-attempt-") already ends in a hyphen. That reservation is what makes
// the endsWith check below unambiguous instead of a heuristic.
//
// ci/download-optional-run-artifacts.sh lists artifacts via the GitHub API scoped to
// GITHUB_RUN_ID, which spans every workflow attempt of that run, not just the one currently
// executing. That makes a same-suite collision reachable across attempts even though a suite's
// primary and retry uploads are mutually exclusive within a single attempt: if an earlier attempt
// left "suite-retry" behind (its primary failed, its retry succeeded) and a later attempt of the
// same job reruns with the primary succeeding cleanly, both "suite" and "suite-retry" are
// finalized, visible, and downloaded together.
//
// When that happens, this script cannot always tell which one is genuinely newer. The common case
// — a later attempt's primary re-upload (overwrite:true: list, delete, then create/finalize) fully
// replaces or deletes the old "suite" before it can fail — does leave "suite" newer whenever both
// survive. But if that overwrite instead fails during the list/delete step, before any delete
// lands, the old "suite" can survive untouched while that same attempt's retry step still runs and
// finalizes a genuinely newer "suite-retry". This is a real gap, not a hypothetical one:
// actions/upload-artifact's overwrite path (deleteArtifactIfExists in its bundled
// dist/upload/index.js, verified against the pinned actions/upload-artifact@v7 source) catches
// every delete error except "not found" as best-effort and proceeds to create/finalize anyway, so a
// transient delete failure leaves the old "suite" registered and untouched while the subsequent
// create collides with it and fails the whole primary step — never having touched "suite".
//
// There's no reliable way to distinguish the two cases from inside this script: extracted file
// mtimes reflect when each file was written on the runner, not when GitHub finalized the artifact,
// so they don't order two artifacts by upload recency. Reading upload timestamps or attempt numbers
// instead would mean adding manifest/marker metadata to the two directory-name-keyed consumers
// (coverage-check, vouchington-tooling) — out of scope for a repo-local CI fix that's meant to leave
// both consumers untouched.
//
// So on a collision this defaults to keeping "suite" and discarding "suite-retry" — correct in the
// common case, and a documented, accepted residual risk in the rarer list/delete-failure case —
// rather than failing the whole fan-in over an artifact that was most likely superseded, not
// corrupted.

import { existsSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const RETRY_SUFFIX = '-retry'

export function normalizeRetryArtifactDirectories(root: string): void {
  if (!existsSync(root)) return

  const entries = readdirSync(root, { withFileTypes: true })
  const siblingNames = new Set<string>()
  for (const entry of entries) if (entry.isDirectory()) siblingNames.add(entry.name)

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.endsWith(RETRY_SUFFIX)) continue

    const target = entry.name.slice(0, -RETRY_SUFFIX.length)
    if (siblingNames.has(target)) {
      console.warn(
        `::warning::normalize-retry-artifact-directories: both "${target}" and "${entry.name}" ` +
          `are present under ${root} — cross-attempt recency can't be determined here. Defaulting ` +
          `to "${target}" and discarding "${entry.name}"; this is usually correct, but see ` +
          `ci/normalize-retry-artifact-directories.mts for the documented residual risk.`,
      )
      rmSync(join(root, entry.name), { recursive: true, force: true })
      continue
    }

    renameSync(join(root, entry.name), join(root, target))
  }
}

function main(): number {
  const [root] = process.argv.slice(2)
  if (!root) {
    console.error('Usage: normalize-retry-artifact-directories.mts <root>')
    return 2
  }
  try {
    normalizeRetryArtifactDirectories(root)
    return 0
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main()
}
