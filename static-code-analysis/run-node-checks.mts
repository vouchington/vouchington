#!/usr/bin/env node
import { fileURLToPath } from 'node:url'

import { buildSharedContext, type SharedContext } from 'vouchington-tooling/shared-context'

import { checkConfigInventoryPolicy } from './config-inventory/index.mts'
import type { CheckName, CheckResult } from './node-check-types.mts'
import { checkRepoFilePolicy } from './repo-file-policy/index.mts'
import { checkSccComplexity } from './scc-complexity/index.mts'
import { checkTargetedGuardrails } from './targeted-guardrails/index.mts'
import {
  runRepoFilePolicyInWorker,
  type RunRepoFilePolicyInWorker,
} from './repo-file-policy-worker-client.mts'
import { isInvokedAsScript, runNodeChecksCli } from './run-node-checks-cli.mts'
export type { CheckName, CheckResult } from './node-check-types.mts'

async function runOne(check: CheckName, ctx: SharedContext): Promise<CheckResult> {
  switch (check) {
    case 'config-inventory-policy': {
      const report = await checkConfigInventoryPolicy(ctx)
      return { name: check, errors: report.errors }
    }
    case 'repo-file-policy': {
      const report = await checkRepoFilePolicy(ctx)
      return { name: check, errors: report.errors }
    }
    case 'scc-complexity': {
      const report = await checkSccComplexity(ctx)
      return { name: check, errors: report.errors }
    }
    case 'targeted-guardrails': {
      const report = checkTargetedGuardrails(ctx)
      return { name: check, errors: report.errors }
    }
  }
}

function runOneOrWorker(
  check: CheckName,
  ctx: SharedContext,
  dependencies: {
    runRepoFilePolicyInWorker?: RunRepoFilePolicyInWorker
  } = {},
): Promise<CheckResult> {
  if (check === 'repo-file-policy' && dependencies.runRepoFilePolicyInWorker) {
    return dependencies.runRepoFilePolicyInWorker(
      ctx.repoRoot,
      ctx.isInsideGitRepo,
      ctx.trackedFiles,
    )
  }
  return runOne(check, ctx)
}

export async function runNodeChecks(options: {
  checks: CheckName[]
  repoRoot: string
  dependencies?: {
    runRepoFilePolicyInWorker?: RunRepoFilePolicyInWorker
  }
}): Promise<CheckResult[]> {
  const ctx = await buildSharedContext(options.repoRoot)
  return Promise.all(options.checks.map(check => runOneOrWorker(check, ctx, options.dependencies)))
}

export async function runNodeChecksCliParallel(options: {
  checks: CheckName[]
  repoRoot: string
}): Promise<CheckResult[]> {
  return runNodeChecks({
    ...options,
    dependencies: options.checks.length > 1 ? { runRepoFilePolicyInWorker } : undefined,
  })
}

void runNodeChecksCli({
  args: process.argv.slice(2),
  cwd: process.cwd(),
  error: console.error,
  exit: process.exit,
  isMain: isInvokedAsScript(process.argv[1], fileURLToPath(import.meta.url)),
  log: console.log,
  run: runNodeChecksCliParallel,
})
