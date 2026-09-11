#!/usr/bin/env node

import {
  assertWorkflowCommandDrift,
  runCiLocal as runPublished,
} from 'vouchington-tooling/ci-local'
import { targets } from './ci-local/targets.mts'
import type { CiLocalTarget, CiLocalTargetName } from './ci-local/types.mts'

export { assertWorkflowCommandDrift }
export type { CiLocalTarget, CiLocalTargetName }

const USAGE = 'Usage: node ci/ci-local.mts [--list] | <target> [--dry-run]'

export function getCiLocalTargets(): Record<CiLocalTargetName, CiLocalTarget> {
  return targets
}

export function runCiLocal(args: string[]): number {
  return runPublished({ args, targets, usage: USAGE })
}

if (process.argv[1] === import.meta.filename) {
  process.exitCode = runCiLocal(process.argv.slice(2))
}
