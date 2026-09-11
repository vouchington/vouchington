import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  isGhApiShellScriptFile,
  isGhApiWorkflowFile,
  shellScriptViolations,
  workflowYamlViolations,
  type ShellQuotingViolation,
} from './gh-api-shell-quoting.mts'

function reportViolations(file: string, violations: ShellQuotingViolation[], errors: string[]) {
  for (const violation of violations) {
    errors.push(
      `::error file=${file},line=${violation.line}::${file}:${violation.line}: unquoted ` +
        `\`?\`/\`&\` in a \`gh api\` argument (${violation.excerpt}) — quote the argument so a ` +
        'stray shell operator cannot silently truncate the call (issue #10956)',
    )
  }
}

// Repo-wide enforcement counterpart to gh-api-shell-quoting.test.mts: this is the guard that
// actually runs in `pnpm run repo-file-policy` and the "Repo Node static checks" CI step, so a
// change here (or a workflow/script edit it should catch) cannot pass Static Code Analysis while
// only the separate tooling-test job would have flagged it (issue #10956 review).
export function checkGhApiShellQuoting(
  repoRoot: string,
  trackedFiles: readonly string[],
  errors: string[],
): void {
  for (const file of trackedFiles) {
    if (isGhApiWorkflowFile(file)) {
      const content = readFileSync(join(repoRoot, file), 'utf8')
      let violations: ShellQuotingViolation[]
      try {
        violations = workflowYamlViolations(content)
      } catch (error) {
        errors.push(`::error file=${file}::${file}: invalid YAML (${(error as Error).message})`)
        continue
      }
      reportViolations(file, violations, errors)
      continue
    }
    if (isGhApiShellScriptFile(file)) {
      reportViolations(
        file,
        shellScriptViolations(readFileSync(join(repoRoot, file), 'utf8')),
        errors,
      )
    }
  }
}
