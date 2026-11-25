import type { RunTextCommand } from 'vouchington-tooling/gh-cli'
import { auditProjectCompletion, type ClosingIssueRef } from 'vouchington-tooling/github-projects'
import type { ClosingIssueForAudit } from 'vouchington-tooling/pr-description'

function toClosingIssueRef({ issue, repo }: ClosingIssueForAudit): ClosingIssueRef {
  return { number: issue.number, repo }
}

/**
 * Composition point for the pull-request policy (`dev/agent-policy/pull-request.mts`): adapts
 * `vouchington-tooling/github-projects`'s `auditProjectCompletion` to the
 * `(closingIssues) => Promise<string[]>` shape `validatePrBodyWithIssueReferences` expects.
 */
export function createProjectAuditor(
  runGh: RunTextCommand,
  repo: string,
): (closingIssues: ClosingIssueForAudit[]) => Promise<string[]> {
  return closingIssues => auditProjectCompletion(runGh, repo, closingIssues.map(toClosingIssueRef))
}
