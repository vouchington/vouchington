import { globSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  localHandoffFlagViolations,
  prShepherdGuidanceViolations,
} from './pr-shepherd-guidance-policy.mts'

const GUIDANCE_GLOBS = ['.agents/skills/**/*.md', 'docs/**/*.md'] as const

/** Read checked-in skills and docs. Vitest supplies synthetic text instead. */
export function checkPrShepherdGuidance(root: string): string[] {
  const paths = GUIDANCE_GLOBS.flatMap(pattern => globSync(pattern, { cwd: root })).toSorted()
  const files = paths.map(path => ({
    path,
    text: readFileSync(join(root, path), 'utf8'),
  }))
  return [...prShepherdGuidanceViolations(files), ...localHandoffFlagViolations(files)]
}

if (import.meta.main) {
  const violations = checkPrShepherdGuidance(process.cwd())
  if (violations.length > 0) {
    console.error(violations.join('\n'))
    process.exitCode = 1
  }
}
