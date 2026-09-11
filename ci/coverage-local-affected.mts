#!/usr/bin/env node
// coverage:patch:affected — run coverage only for suites affected by the diff.
//
// Fast pre-check for cross-project PRs. CI and `coverage:patch:full` remain authoritative.

import { execFileSync } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { flagValue } from './coverage-local-utils.mts'

import {
  affectedSuites,
  hasWebInit,
  suiteCoverageCommand,
  suitesForFile,
  type Suite,
  webInitSuiteNames,
} from './coverage-suites-local.mts'
import {
  runAndStampLocalCoverageSuite,
  validateLocalCoverageArtifacts,
} from './coverage-local-provenance.mts'
import {
  advisoryGateSummaryLines,
  resolveAdvisoryExitCode,
  selectionDiagnosticLines,
  suiteFailureReproductionLines,
} from './coverage-local-affected-output.mts'
import { runMergeAndCheck, zeroThresholdGlobs } from './coverage-check-gate.mts'

import picomatch from 'picomatch'

function usage(): string {
  return [
    'Usage: pnpm run coverage:patch:affected -- [--base <ref>] [--head <ref>] [--strict]',
    '',
    'Detects which Vitest suites are affected by the committed diff and runs them with',
    '--coverage, merges the LCOV artifacts, and previews patch coverage.',
    '',
    'This is a FAST PRE-CHECK. CI and `pnpm run coverage:patch:full` are authoritative.',
    'Path-prefix suite selection means overlaps add coverage but never hide it.',
    '',
    'Advisory by default: shortfalls are printed but never fail this command.',
    'Pass --strict to restore the previous blocking exit-code behavior.',
    '',
    'Reads committed changes only (git diff base...head). Commit before running.',
    '',
    `Web-init suites (${webInitSuiteNames()}) require web init:`,
    '  ./dev/initialize web && source .env',
    '',
    'web/components/** coverage is under-reported locally (web-storybook-browser is CI-only).',
  ].join('\n')
}

async function main(argv: string[]): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage())
    return 0
  }

  const base = flagValue(argv, '--base') ?? 'origin/main'
  const head = flagValue(argv, '--head') ?? 'HEAD'
  const strict = argv.includes('--strict')

  // Committed changes only (`origin/main...HEAD`)
  let changedOutput: string
  try {
    changedOutput = execFileSync('git', ['diff', '--name-only', `${base}...${head}`], {
      encoding: 'utf8',
    })
  } catch (error) {
    console.error(
      `Failed to compute git diff ${base}...${head}: ${error instanceof Error ? error.message : String(error)}`,
    )
    return 1
  }

  const changed = changedOutput.split('\n').flatMap(l => (l.trim() ? [l.trim()] : []))

  if (changed.length === 0) {
    console.log(`No committed changes vs ${base} — nothing to check.`)
    return 0
  }

  const { suites, unmapped, uninstrumented } = affectedSuites(changed)

  const webInit = hasWebInit()
  const runnable: Suite[] = []
  const skipped: Suite[] = []
  for (const suite of suites) {
    if (suite.requiresWebInit && !webInit) {
      skipped.push(suite)
    } else {
      runnable.push(suite)
    }
  }
  const skippedSet = new Set(skipped)

  // ── Loud warnings (never silent) ────────────────────────────────────────────

  // Files whose *every* matching suite was skipped (per-file predicate, not per-suite, to avoid
  // false alarms on backend/modules/ files also verified by backend-modules). Exclude patch_coverage_min:0
  // in .coverage-rules.yml (e.g. backend/scripts/**) — they need no local verification.
  const zeroGlobs = zeroThresholdGlobs()
  const isZero = zeroGlobs.length > 0 ? picomatch(zeroGlobs) : () => false
  const notVerified = changed.filter(f => {
    const m = suitesForFile(f)
    return m.length > 0 && m.every(s => skippedSet.has(s)) && !isZero(f)
  })
  for (const line of selectionDiagnosticLines({
    notVerified,
    trulyUnmapped: unmapped,
    uninstrumented,
  })) {
    console.log(line)
  }

  console.log(
    'Note: This is a fast pre-check — CI and `pnpm run coverage:patch:full` are authoritative.',
  )
  if (skipped.length > 0) {
    console.log(
      `Note: skipping web-init suite(s): ${skipped.map(s => s.name).join(', ')} (run ./dev/initialize web to include).`,
    )
  }
  console.log('')

  if (runnable.length === 0) {
    console.log('No runnable suites affected by the diff.')
    if (notVerified.length > 0) {
      console.log('Run ./dev/initialize web && source .env, then re-run coverage:patch:affected.')
      if (!strict) for (const line of advisoryGateSummaryLines({ notVerified })) console.log(line)
    }
    return resolveAdvisoryExitCode({ strict, blockingStatus: 0, notVerified })
  }

  console.log(`Affected suites: ${runnable.map(s => s.name).join(', ')}`)
  console.log('')

  const coverageDir = 'coverage-affected'
  await rm(coverageDir, { recursive: true, force: true })

  for (const suite of runnable) {
    console.log(`Running ${suite.name}...`)
    let status: number
    try {
      status = runAndStampLocalCoverageSuite(suite.name, coverageDir)
    } catch (error) {
      console.error(
        `Suite "${suite.name}" failed to start: ${error instanceof Error ? error.message : String(error)}`,
      )
      for (const line of suiteFailureReproductionLines(suite, coverageDir, base, head)) {
        console.error(line)
      }
      return 1
    }
    if (status !== 0) {
      console.error(`Suite "${suite.name}" failed. Fix failing tests before checking coverage.`)
      for (const line of suiteFailureReproductionLines(suite, coverageDir, base, head)) {
        console.error(line)
      }
      return status
    }
  }

  console.log('')
  console.log('Merging coverage artifacts and running gate...')

  let gateStatus: number
  try {
    validateLocalCoverageArtifacts(coverageDir)
    gateStatus = await runMergeAndCheck({
      artifactsDir: coverageDir,
      base,
      head,
      advisory: !strict,
    })
  } catch (error) {
    console.error(
      `Error running coverage gate: ${error instanceof Error ? error.message : String(error)}`,
    )
    return 1
  }

  if (gateStatus !== 0) {
    console.log('')
    console.log('Reproduce per affected suite:')
    for (const suite of runnable) {
      const { envPrefix, command } = suiteCoverageCommand(suite, coverageDir)
      console.log(`  ${envPrefix}${command}`)
    }
    console.log(`  pnpm run coverage:patch -- --artifacts ${coverageDir}`)
  }

  if (!strict) for (const line of advisoryGateSummaryLines({ notVerified })) console.log(line)
  return resolveAdvisoryExitCode({ strict, blockingStatus: gateStatus, notVerified })
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)))
}
