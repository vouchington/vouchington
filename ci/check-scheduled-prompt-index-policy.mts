import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { scheduledPromptIndexViolations } from './scheduled-prompt-index-policy.mts'
import { trackedFiles } from './tracked-files.mts'

export function checkScheduledPromptIndexPolicy(root: string): string[] {
  const paths = trackedFiles(root, ['docs/prompts/scheduled']).filter(path =>
    /^docs\/prompts\/scheduled\/[^/]+\.md$/.test(path),
  )
  const index = readFileSync(join(root, 'docs/prompts/SCHEDULED.md'), 'utf8')
  return scheduledPromptIndexViolations(index, paths)
}
if (import.meta.main) {
  const violations = checkScheduledPromptIndexPolicy(process.cwd())
  if (violations.length > 0) {
    console.error(violations.join('\n'))
    process.exitCode = 1
  }
}
