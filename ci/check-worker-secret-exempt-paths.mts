import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { workerSecretExemptPathViolations } from './worker-secret-exempt-paths-policy.mts'

const RELATIVE_PATH = 'backend/api/app-origin-guard.mts'

/** Read the origin guard. Vitest supplies synthetic text instead. */
export function checkWorkerSecretExemptPaths(root: string): string[] {
  return workerSecretExemptPathViolations(readFileSync(join(root, RELATIVE_PATH), 'utf8'))
}

if (import.meta.main) {
  const violations = checkWorkerSecretExemptPaths(process.cwd())
  if (violations.length > 0) {
    console.error(violations.join('\n'))
    process.exitCode = 1
  }
}
