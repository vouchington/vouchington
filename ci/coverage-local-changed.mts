#!/usr/bin/env node
// coverage:changed — the cheapest local coverage signal: run only the literal test files the
// agent already touched (staged, unstaged, and untracked), with coverage instrumentation, and
// preview patch coverage for just those changes. Meant to replace step 2 of
// .agents/skills/agent-workflow/before-pushing.md's 4-command list
// (`pnpm exec vitest run <files> --bail=3`) once it's confirmed comparable in cost.
//
// Always advisory for coverage thresholds (never blocks on a shortfall — see
// docs/development/reference-tests-local-patch-coverage-preview.md). A real test failure still
// propagates its exit code: this replaces a test-running step, and a tool that swallows test
// failures would be strictly worse than what it replaces.
//
// coverage:patch:full remains authoritative. This is a fast, partial, single-run preview.

import { spawnSync } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import { collapseRanges } from 'coverage-check'
import { getChangedLines, WORKTREE_HEAD } from 'coverage-check/src/diff-parser.mts'

import { flagValue } from './coverage-local-utils.mts'
import { evaluateMergeAndCheck, zeroThresholdGlobs } from './coverage-check-gate.mts'
import {
  CHANGED_SUITE_NAME,
  stampChangedCoverage,
  validateChangedCoverage,
} from './coverage-local-changed-provenance.mts'
import { envForCoverageRun, type CoverageEnvSuite } from './coverage-suite-env.mts'
import { suitesForFile } from './coverage-suites-local.mts'

const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:mts|ts|tsx)$/

function usage(): string {
  return [
    'Usage: pnpm run coverage:changed -- [--base <ref>]',
    '',
    'Runs Vitest with coverage over only the changed test files (staged, unstaged, and',
    'untracked, via git diff against the working tree — same file set coverage-check’s own',
    '--head WORKTREE sentinel would compute), then previews patch coverage for just those files.',
    '',
    'This is the cheapest local coverage signal: no whole-suite runs, no static zero-fill pass.',
    'It is a fast, partial, advisory PREVIEW. `pnpm run coverage:patch:full` is authoritative.',
    '',
    'Always advisory for coverage thresholds. A real test failure still exits non-zero.',
  ].join('\n')
}

function envSuiteFor(testFiles: readonly string[]): CoverageEnvSuite {
  const matchedSuites = testFiles.flatMap(file => suitesForFile(file))
  return {
    coverageScope: CHANGED_SUITE_NAME,
    requiresWebInit: matchedSuites.some(suite => suite.requiresWebInit),
    unsetEnv: [...new Set(matchedSuites.flatMap(suite => suite.unsetEnv ?? []))],
  }
}

function printReport(
  evaluated: Awaited<ReturnType<typeof evaluateMergeAndCheck>>,
  changedTestFiles: readonly string[],
): void {
  console.log('')
  console.log(
    'coverage:changed — advisory preview of just the changed test files. Partial and never',
  )
  console.log('blocking; run `pnpm run coverage:patch:full` for the authoritative check.')

  if (evaluated.result === null) {
    console.log('')
    console.log(evaluated.skippedReason ?? 'No coverage result was produced.')
    return
  }

  const { buckets, informational, missingCoverage } = evaluated.result
  const diffContent = evaluated.diffContent
  const coveredFiles = [...buckets.flatMap(bucket => bucket.files), ...informational].filter(
    file => file.coverable > 0,
  )
  const totalHit = coveredFiles.reduce((sum, file) => sum + file.hit, 0)
  const totalCoverable = coveredFiles.reduce((sum, file) => sum + file.coverable, 0)

  console.log('')
  console.log(
    `Covered ${totalHit}/${totalCoverable} changed lines in ${coveredFiles.length} file(s)`,
  )
  for (const file of coveredFiles) {
    console.log(`  ${file.file}: ${file.hit}/${file.coverable}`)
  }

  console.log('')
  console.log('Uncovered')
  const uncoveredFiles = coveredFiles.filter(file => file.uncoveredLines.length > 0)
  if (uncoveredFiles.length === 0) {
    console.log('  (none)')
  } else {
    for (const file of uncoveredFiles) {
      console.log(`  ${file.file}:`)
      for (const lineNo of file.uncoveredLines) {
        const text = diffContent?.get(file.file)?.get(lineNo) ?? ''
        console.log(`    L${lineNo}  ${text}`)
      }
    }
  }

  console.log('')
  console.log('No coverage data')
  if (missingCoverage.length === 0) {
    console.log('  (none)')
  } else {
    for (const missing of missingCoverage) {
      console.log(`  ${missing.file} (rule ${missing.rule}): ${collapseRanges(missing.lines)}`)
    }
  }

  console.log('')
  console.log(`Ran: ${changedTestFiles.join(' ')}`)
}

async function main(argv: string[]): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage())
    return 0
  }

  const base = flagValue(argv, '--base') ?? 'origin/main'

  let diff: Awaited<ReturnType<typeof getChangedLines>>
  try {
    diff = await getChangedLines(base, WORKTREE_HEAD)
  } catch (error) {
    console.error(
      `Failed to compute the working-tree diff vs ${base}: ${error instanceof Error ? error.message : String(error)}`,
    )
    return 1
  }

  const changedFiles = [...diff.keys()]
  const changedTestFiles = changedFiles.filter(file => TEST_FILE_PATTERN.test(file))
  const changedSourceFiles = changedFiles.filter(file => !TEST_FILE_PATTERN.test(file))

  if (changedTestFiles.length === 0) {
    console.log('No changed test files — nothing to run.')
    if (changedSourceFiles.length > 0) {
      console.log(
        `(${changedSourceFiles.length} changed source file(s) with no corresponding test changes.)`,
      )
    }
    return 0
  }

  const coverageDir = 'coverage-changed'
  await rm(coverageDir, { recursive: true, force: true })
  const reportsDirectory = join(coverageDir, CHANGED_SUITE_NAME)

  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const args = [
    'exec',
    'vitest',
    'run',
    ...changedTestFiles,
    '--coverage',
    `--coverage.reportsDirectory=${reportsDirectory}`,
    '--bail=3',
  ]

  const result = spawnSync(pnpm, args, {
    stdio: 'inherit',
    env: envForCoverageRun(envSuiteFor(changedTestFiles), process.cwd(), process.env),
  })
  if (result.error) throw result.error
  const status = result.status ?? 1
  if (status !== 0) {
    console.error('')
    console.error('Changed test file(s) failed — fix before checking coverage.')
    return status
  }

  const root = process.cwd()
  stampChangedCoverage(changedTestFiles, coverageDir, root)
  validateChangedCoverage(changedTestFiles, coverageDir, root)

  const evaluated = await evaluateMergeAndCheck({
    artifactsDir: coverageDir,
    base,
    head: WORKTREE_HEAD,
    excludePathGlobs: zeroThresholdGlobs(),
    advisory: true,
  })

  printReport(evaluated, changedTestFiles)
  return 0
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)))
}
