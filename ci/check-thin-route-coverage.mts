import { globSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { thinRouteCoverageViolations } from './thin-route-coverage-policy.mts'

const ROUTE_GLOBS = [
  'web/app/*/{bank-account,card,instance,referral-program,rewards-program,rewards-program-status,source,topic}/**/{page,layout}.{ts,tsx}',
  'web/app/*/{article,blog-post,data-point,discussion,link,review,story}/**/{page,layout}.{ts,tsx}',
] as const

const COVERAGE_FILES = [
  'web/lib/routes/__tests__/app-routes-posts.test.tsx',
  'web/lib/routes/__tests__/app-routes-smoke.test.tsx',
  'web/lib/routes/__tests__/app-routes-topic-accounts.test.tsx',
  'web/lib/routes/__tests__/app-routes-topic-instance-source.test.tsx',
  'web/lib/routes/__tests__/app-routes-topic-referral.test.tsx',
  'web/lib/routes/__tests__/app-routes-topic-rewards.test.tsx',
] as const

/** Read the thin route files and the tests that import them. Vitest supplies synthetic text. */
export function checkThinRouteCoverage(root: string): string[] {
  const discovered = ROUTE_GLOBS.flatMap(pattern => globSync(pattern, { cwd: root })).toSorted()
  const coverageText = COVERAGE_FILES.map(path => readFileSync(join(root, path), 'utf8')).join('\n')
  return thinRouteCoverageViolations(discovered, coverageText)
}

if (import.meta.main) {
  const violations = checkThinRouteCoverage(process.cwd())
  if (violations.length > 0) {
    console.error(violations.join('\n'))
    process.exitCode = 1
  }
}
