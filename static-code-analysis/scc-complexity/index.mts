import { readFileSync } from 'node:fs'

import {
  buildSccArgs,
  checkSccComplexity as checkPublished,
  parseSccComplexityBaseline,
  parseSccComplexityViolations,
  SCC_COMPLEXITY_LIMIT,
  type SccComplexityBaseline,
  type SccComplexityScope,
  type SccComplexityViolation,
} from 'vouchington-tooling/scc-complexity'
import type { SharedContext } from 'vouchington-tooling/shared-context'

export { parseSccComplexityViolations, SCC_COMPLEXITY_LIMIT }
export type { SccComplexityViolation }

export const FILAMENTS_PRODUCT_SCC_EXCLUDE_DIR =
  '.git,fixtures,__tests__,test-helpers,static-code-analysis,ci,.github,dev'

export const FILAMENTS_SCC_SCOPES: readonly SccComplexityScope[] = [
  {
    name: 'product',
    includePaths: ['.'],
    excludeDir: FILAMENTS_PRODUCT_SCC_EXCLUDE_DIR,
  },
  {
    name: 'tooling',
    includePaths: ['.github', 'ci', 'dev', 'static-code-analysis'],
  },
]

export const TOOLING_SCC_BASELINE = parseSccComplexityBaseline(
  readFileSync(new URL('./tooling-baseline.json', import.meta.url), 'utf8'),
)

export const SCC_COMPLEXITY_ARGS = buildSccArgs(FILAMENTS_SCC_SCOPES[0])

export async function checkSccComplexity(
  ctx: SharedContext,
  runScc?: (outputPath: string, scope?: SccComplexityScope) => Promise<string>,
  processOptions: { command?: string; baseline?: SccComplexityBaseline } = {},
): Promise<{ errors: string[] }> {
  return checkPublished(
    ctx,
    {
      scopes: FILAMENTS_SCC_SCOPES,
      baseline: processOptions.baseline ?? TOOLING_SCC_BASELINE,
      tmpdirPrefix: 'voucha-scc-complexity-',
      command: processOptions.command,
    },
    runScc,
  )
}
