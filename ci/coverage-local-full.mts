#!/usr/bin/env node

import { rm } from 'node:fs/promises'
import { flagValue } from './coverage-local-utils.mts'

import { hasWebInit, SUITES, webInitSuiteNames } from './coverage-suites-local.mts'
import { runMergeAndCheck } from './coverage-check-gate.mts'
import {
  runAndStampLocalCoverageSuite,
  validateLocalCoverageArtifacts,
} from './coverage-local-provenance.mts'

export type { Suite } from './coverage-suites-local.mts'
export { envForSuite, hasWebInit, SUITES } from './coverage-suites-local.mts'

function usage(): string {
  return [
    'Usage: pnpm run coverage:patch:full -- [--base <ref>] [--head <ref>]',
    '',
    'Runs Vitest projects with --coverage, merges LCOV artifacts, and previews patch coverage.',
    `Web-init suites (${webInitSuiteNames()}) run automatically when ./dev/initialize web has`,
    'been run (detected via',
    '.initialized and .env), and the current worktree .env is sourced and validated before those',
    'suites start. backend-aws/openai/bedrock/stripe require real API credentials',
    'and are intentionally excluded.',
  ].join('\n')
}

async function main(argv: string[]): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage())
    return 0
  }

  const base = flagValue(argv, '--base') ?? 'origin/main'
  const head = flagValue(argv, '--head') ?? 'HEAD'
  const webInit = hasWebInit()
  const suitesToRun = SUITES.filter(s => !s.requiresWebInit || webInit)

  if (!webInit) {
    console.log(`Note: skipping web-init suites (${webInitSuiteNames()}).`)
    console.log('      Run ./dev/initialize web && source .env to include them.')
    console.log('')
  }

  console.log('')

  const coverageDir = 'coverage-full'
  // Clear stale coverage data from previous runs to avoid merging stale artifacts.
  await rm(coverageDir, { recursive: true, force: true })

  for (const suite of suitesToRun) {
    console.log(`Running ${suite.name}...`)
    const status = runAndStampLocalCoverageSuite(suite.name, coverageDir)
    if (status !== 0) {
      console.error(`Suite "${suite.name}" failed. Fix failing tests before checking coverage.`)
      return status
    }
  }

  console.log('')
  console.log('Merging coverage artifacts and running gate...')

  try {
    validateLocalCoverageArtifacts(coverageDir)
    return await runMergeAndCheck({ artifactsDir: coverageDir, base, head })
  } catch (error) {
    console.error(
      `Error running coverage gate: ${error instanceof Error ? error.message : String(error)}`,
    )
    return 1
  }
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)))
}
