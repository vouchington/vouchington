#!/usr/bin/env node
// cleanup-artifacts.mts — deletes intermediate GitHub Actions artifacts so the account
// stays under its billed Actions storage cap.
//
// Subcommands:
//
//   run --run-id <id>
//     Deletes every non-expired, delete-classified artifact produced by one workflow
//     run. Intended to run from the producing workflow's terminal success fan-in,
//     after every same-run artifact consumer has finished — see
//     .github/workflows/cleanup-artifacts.yml.
//
//   sweep --older-than-hours <n>
//     Paginates the repo's full artifact list (newest-first) and deletes delete-
//     classified artifacts older than the threshold, but only when the producing run
//     completed with conclusion success or cancelled — never for a failing run, since
//     failed-only reruns may still need sibling artifacts from that run.
//
// Never fails the calling workflow step: per-artifact errors are logged and skipped,
// and this script always exits 0 (the workflow step also sets continue-on-error).

import { runCleanup, sweepCleanup } from './cleanup-artifacts-commands.mts'
import type { DeletionSummary } from './cleanup-artifacts-plan.mts'

function usage(): string {
  return [
    'Usage: cleanup-artifacts.mts run --run-id <id>',
    '       cleanup-artifacts.mts sweep --older-than-hours <n>',
    '',
    'Requires GITHUB_TOKEN or GH_TOKEN and GITHUB_REPOSITORY (owner/repo) in the env.',
  ].join('\n')
}

function flagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  return index === -1 ? undefined : argv[index + 1]
}

function logSummary(subcommand: string, summary: DeletionSummary): void {
  const mb = (summary.bytesFreed / (1024 * 1024)).toFixed(1)
  console.log(
    `[cleanup-artifacts] ${subcommand}: deleted ${summary.deletedCount} artifact(s), freed ~${mb} MB`,
  )
}

export async function main(
  argv: string[],
  env: Record<string, string | undefined> = process.env,
): Promise<number> {
  const [subcommand, ...rest] = argv
  const token = env.GITHUB_TOKEN ?? env.GH_TOKEN
  const repo = env.GITHUB_REPOSITORY

  if (subcommand !== 'run' && subcommand !== 'sweep') {
    console.error(usage())
    return 2
  }
  if (!token || !repo) {
    console.error('[cleanup-artifacts] missing GITHUB_TOKEN/GH_TOKEN or GITHUB_REPOSITORY')
    return 0 // Never fail the calling workflow step for a missing-secret misconfiguration.
  }

  if (subcommand === 'run') {
    const runId = flagValue(rest, '--run-id')
    if (!runId) {
      console.error(usage())
      return 2
    }
    logSummary('run', await runCleanup(repo, token, runId))
    return 0
  }

  const olderThanHoursRaw = flagValue(rest, '--older-than-hours')?.trim()
  const olderThanHours = Number(olderThanHoursRaw)
  // Guard the empty string too: Number('') and Number('   ') are 0, which would
  // otherwise turn a malformed flag into "sweep everything right now".
  if (!olderThanHoursRaw || !Number.isFinite(olderThanHours) || olderThanHours < 0) {
    console.error(usage())
    return 2
  }
  logSummary('sweep', await sweepCleanup(repo, token, olderThanHours))
  return 0
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)))
}
