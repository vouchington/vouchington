import { auditProjectCompletion } from 'vouchington-tooling/github-projects'

import type { RunGh } from './issue-closure.mts'
import type { ClosingIssueForAudit } from './validate.mts'

/**
 * Composition point for `dev/pr-description.mts`: adapts `vouchington-tooling/github-projects`'s
 * `auditProjectCompletion` to the `(closingIssues) => Promise<string[]>` shape `validate.mts`
 * expects — no project-querying logic lives here, only the `ClosingIssueForAudit` -> `{ number,
 * repo }` shape adaptation. Purely advisory: unlike `createMilestoneAuditor`, its output never
 * joins `result.errors`, see `validate.mts`'s `advisories` field.
 */
export function createProjectAuditor(
  runGh: RunGh,
  repo: string,
): (closingIssues: ClosingIssueForAudit[]) => Promise<string[]> {
  return closingIssues =>
    auditProjectCompletion(
      runGh,
      repo,
      closingIssues.map(({ issue, repo: issueRepo }) => ({
        number: issue.number,
        repo: issueRepo,
      })),
    )
}
