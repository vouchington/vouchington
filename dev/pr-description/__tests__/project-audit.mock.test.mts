import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClosingIssueRef } from 'vouchington-tooling/github-projects'

// `createProjectAuditor` owns nothing but the shape adaptation, so this mocks the library out
// entirely rather than re-simulating its GraphQL protocol. The audit itself — sibling lookup,
// the missing-`project`-scope notice, the empty-input short circuit — is covered by
// `vouchington-tooling`'s own `github-projects/project-audit` tests.
const githubProjects = vi.hoisted(() => ({
  auditProjectCompletion:
    vi.fn<(runGh: unknown, repo: string, closing: ClosingIssueRef[]) => Promise<string[]>>(),
}))

vi.mock<typeof import('vouchington-tooling/github-projects')>(
  import('vouchington-tooling/github-projects'),
  () => githubProjects as unknown as typeof import('vouchington-tooling/github-projects'),
)

import type { ReferencedIssue } from '../closing-refs.mts'
import { createProjectAuditor } from '../project-audit.mts'
import type { ClosingIssueForAudit } from '../validate.mts'

const REPO = 'vouchington/vouchington'

const runGh = vi.fn<(args: string[]) => Promise<string>>()

function closingIssue(number: number, repo?: string): ClosingIssueForAudit {
  const issue: ReferencedIssue = {
    body: '',
    isPullRequest: false,
    number,
    state: 'closed',
    title: `Issue ${number}`,
    url: `https://github.com/${repo ?? REPO}/issues/${number}`,
  }
  return { issue, repo }
}

describe('createProjectAuditor', () => {
  beforeEach(() => {
    githubProjects.auditProjectCompletion.mockReset()
    githubProjects.auditProjectCompletion.mockResolvedValue([])
  })

  it('forwards runGh and the audited repo, mapping closing issues to { number, repo }', async () => {
    await createProjectAuditor(runGh, REPO)([closingIssue(1), closingIssue(2, 'other/repo')])

    expect(githubProjects.auditProjectCompletion).toHaveBeenCalledWith(runGh, REPO, [
      { number: 1, repo: undefined },
      { number: 2, repo: 'other/repo' },
    ])
  })

  it('returns the library advisories unchanged', async () => {
    githubProjects.auditProjectCompletion.mockResolvedValue(['Q3 Initiative has 2 open items'])

    await expect(createProjectAuditor(runGh, REPO)([closingIssue(1)])).resolves.toEqual([
      'Q3 Initiative has 2 open items',
    ])
  })
})
