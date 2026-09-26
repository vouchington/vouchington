import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { parsedDependabot } from '../.github/test-helpers/fix-dependabot.test-helpers.mts'
import { parsedMain } from '../.github/test-helpers/fix-main.test-helpers.mts'
import { MAX_SOURCE_RUN_AGE_MS } from './source-run-assessment.mts'
import { SOURCE_RUN_GUARD_JOB_NAMES, SOURCE_RUN_GUARD_SHELL } from './source-run-guard-shell.mts'
import {
  SOURCE_RUN_STATE_FIXTURES,
  type SourceRunStateFixture,
} from './source-run-state-fixtures.mts'
import { sourceStateExitCode } from './source-run-state.mts'

// The fake `gh` stands in for a completed `gh api ... --jq '...'` call: it prints the exact TSV
// row the guard would have received, bypassing gojq/fromdateiso8601 entirely. Freshness is
// precomputed by the test from MAX_SOURCE_RUN_AGE_MS, so this differential test exercises the
// guard's bucketing (the bash comparisons), not the real jq date arithmetic — the interpolated
// bound literal is asserted separately below. The embedded --jq program itself is never executed
// or parsed by any suite here, so a syntactically broken filter would still ship green and only
// fail closed live, on every splice site at once. A real-jq canary is deferred to #10167's
// totality work rather than added here.
const FAKE_GH_SCRIPT = '#!/bin/sh\nprintf \'%s\\n\' "$FAKE_GH_TSV_OUTPUT"\n'

let fakeGhDir: string

function tsvField(value: string | number | null): string {
  return value === null ? '' : String(value)
}

function runGuardShell(fixture: SourceRunStateFixture) {
  const outputDir = mkdtempSync(join(tmpdir(), 'source-run-guard-shell-output-'))
  const outputPath = join(outputDir, 'github-output')
  writeFileSync(outputPath, '')

  try {
    const fresh = fixture.now - Date.parse(fixture.response.run_started_at) <= MAX_SOURCE_RUN_AGE_MS
    const tsvRow = [
      fixture.response.repository.full_name,
      tsvField(fixture.response.id),
      tsvField(fixture.response.run_attempt),
      fixture.response.status,
      tsvField(fixture.response.conclusion),
      String(fresh),
    ].join('\t')

    const result = spawnSync('bash', ['-c', SOURCE_RUN_GUARD_SHELL], {
      encoding: 'utf8',
      env: {
        FAKE_GH_TSV_OUTPUT: tsvRow,
        GITHUB_OUTPUT: outputPath,
        GITHUB_REPOSITORY: fixture.expected.repository,
        PATH: `${fakeGhDir}:${process.env.PATH ?? ''}`,
        SOURCE_RUN_ATTEMPT: String(fixture.expected.runAttempt),
        SOURCE_RUN_CONCLUSION: fixture.expected.conclusion,
        SOURCE_RUN_ID: String(fixture.expected.runId),
      },
    })

    return { output: readFileSync(outputPath, 'utf8'), status: result.status }
  } finally {
    rmSync(outputDir, { force: true, recursive: true })
  }
}

describe('SOURCE_RUN_GUARD_SHELL', () => {
  beforeAll(() => {
    fakeGhDir = mkdtempSync(join(tmpdir(), 'source-run-guard-shell-fake-gh-'))
    const ghPath = join(fakeGhDir, 'gh')
    writeFileSync(ghPath, FAKE_GH_SCRIPT)
    chmodSync(ghPath, 0o755)
  })

  afterAll(() => {
    rmSync(fakeGhDir, { force: true, recursive: true })
  })

  it.each(SOURCE_RUN_STATE_FIXTURES.map(fixture => [fixture.name, fixture] as const))(
    'buckets %s the same as assessSourceRunState',
    (_name, fixture) => {
      const { output, status } = runGuardShell(fixture)

      expect(status).toBe(sourceStateExitCode(fixture.result))
      expect(output).toContain(`current=${String(fixture.result.current)}`)
    },
  )

  it('interpolates the exact MAX_SOURCE_RUN_AGE_MS bound', () => {
    expect(MAX_SOURCE_RUN_AGE_MS).toBe(48 * 60 * 60 * 1000)
    expect(SOURCE_RUN_GUARD_SHELL).toContain(
      '((now - (.run_started_at | fromdateiso8601)) <= (172800))',
    )
  })

  it('projects jq fields in the same order the guard reads them', () => {
    expect(SOURCE_RUN_GUARD_SHELL).toContain(
      "--jq '[.repository.full_name, .id, .run_attempt, .status, .conclusion,",
    )
    expect(SOURCE_RUN_GUARD_SHELL).toMatch(
      /read -r actual_repo actual_id actual_attempt actual_status actual_conclusion actual_fresh/,
    )
  })

  const spliceSites = [
    ...SOURCE_RUN_GUARD_JOB_NAMES.map(jobName => ['fix-main.yml', jobName, parsedMain] as const),
    ['fix-dependabot.yml', 'revalidate-dispatch', parsedDependabot],
    ['fix-dependabot.yml', 'escalate', parsedDependabot],
  ] as const

  it.each(spliceSites)(
    "splices the canonical guard verbatim into %s's %s job's Revalidate source run step",
    (_workflowName, jobName, parsed) => {
      const step = parsed.jobs?.[jobName]?.steps?.find(candidate => candidate.id === 'source-state')
      expect(step?.run).toBe(SOURCE_RUN_GUARD_SHELL)
    },
  )
})
