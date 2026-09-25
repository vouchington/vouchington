import {
  autoFormatChecker,
  dataPwSpecChecker,
  nonWebMockPolicyChecker,
  servicePackageChecker,
  type Checker,
  type PostToolUseWarning,
} from './post-tool-use-checkers.mts'

export type { PostToolUseWarning } from './post-tool-use-checkers.mts'

const CHECKERS: Checker[] = [
  autoFormatChecker,
  nonWebMockPolicyChecker,
  dataPwSpecChecker,
  servicePackageChecker,
]

export function checkFile(filePath: string, worktreeRoot: string): PostToolUseWarning[] {
  try {
    const warnings: PostToolUseWarning[] = []
    for (const checker of CHECKERS) {
      if (checker.matches(filePath, worktreeRoot)) {
        const results = checker.check(filePath, worktreeRoot)
        warnings.push(...results)
      }
    }
    return warnings
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return [{ level: 'error', message: `Unexpected error in post-tool-use checks: ${message}` }]
  }
}
