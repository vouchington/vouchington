import { describe, expect, it } from 'vitest'

import type { ReferencedIssue } from '../closing-refs.mts'
import { createProjectAuditor } from '../project-audit.mts'
import type { ClosingIssueForAudit } from '../validate.mts'

const REPO = 'jonathanong/filaments'
const OTHER_REPO = 'other/repo'
const PROJECT_ID = 'PVT_project-a'
const PROJECT_TITLE = 'Q3 Initiative'
const PROJECT_URL = 'https://github.com/orgs/jonathanong/projects/1'

function referencedIssue(overrides: Partial<ReferencedIssue> = {}): ReferencedIssue {
  return {
    body: '',
    isPullRequest: false,
    milestone: undefined,
    number: 1,
    state: 'closed',
    title: 'Issue',
    url: 'https://github.com/owner/repo/issues/1',
    ...overrides,
  }
}

function closingIssue(
  overrides: Partial<ReferencedIssue>,
  repo: string | undefined = undefined,
): ClosingIssueForAudit {
  return { issue: referencedIssue(overrides), repo }
}

function argValue(args: string[], key: string): string | undefined {
  const match = args.find(a => a.startsWith(`${key}=`))
  return match?.slice(key.length + 1)
}

type MembershipFixture = Record<string, Array<{ id: string; title: string; url: string }>>
type ItemsFixture = Record<
  string,
  Array<{ number: number; repo?: string; state?: string; title?: string }>
>

// Mirrors `vouchington-tooling`'s own `project-audit.test.mts` fixture shape: branches on the
// `id=` GraphQL variable (project items query) vs `owner=`/`repo=`/`number=` (issue membership
// query) the same way `buildProjectItemsArgs`/`buildIssueProjectItemsArgs` shape their arguments.
function fakeRunGh(memberships: MembershipFixture, items: ItemsFixture = {}) {
  return (args: string[]) => {
    const id = argValue(args, 'id')
    if (id !== undefined) {
      const nodes = (items[id] ?? []).map(item => ({
        content: {
          __typename: 'Issue',
          number: item.number,
          repository: { nameWithOwner: item.repo ?? REPO },
          state: item.state ?? 'OPEN',
          title: item.title ?? `Issue ${item.number}`,
        },
      }))
      return Promise.resolve(JSON.stringify({ data: { node: { items: { nodes } } } }))
    }
    const owner = argValue(args, 'owner')
    const repo = argValue(args, 'repo')
    const number = argValue(args, 'number')
    const key = `${owner}/${repo}#${number}`.toLowerCase()
    const nodes = (memberships[key] ?? []).map(project => ({
      project: { closed: false, id: project.id, title: project.title, url: project.url },
    }))
    return Promise.resolve(
      JSON.stringify({ data: { repository: { issue: { projectItems: { nodes } } } } }),
    )
  }
}

describe('createProjectAuditor', () => {
  it('adapts ClosingIssueForAudit to the tooling shape and reports found open project items', async () => {
    const key = `${REPO.toLowerCase()}#1`
    const runGh = fakeRunGh(
      { [key]: [{ id: PROJECT_ID, title: PROJECT_TITLE, url: PROJECT_URL }] },
      { [PROJECT_ID]: [{ number: 1 }, { number: 2, title: 'Stranded ticket' }] },
    )
    const auditor = createProjectAuditor(runGh, REPO)

    const advisories = await auditor([closingIssue({ number: 1 })])

    expect(advisories).toHaveLength(1)
    expect(advisories[0]).toContain(`${REPO.toLowerCase()}#2`)
    expect(advisories[0]).toContain('Stranded ticket')
    expect(advisories[0]).toContain(PROJECT_TITLE)
    expect(advisories[0]).toContain(PROJECT_URL)
  })

  it('reports nothing when nothing is nearly complete', async () => {
    const auditor = createProjectAuditor(fakeRunGh({}), REPO)
    await expect(auditor([closingIssue({ number: 1 })])).resolves.toEqual([])
  })

  it('collapses to a single non-blocking skipped-audit notice on a missing project scope', async () => {
    const runGh = () => Promise.reject(new Error("The 'project' scope is required."))
    const auditor = createProjectAuditor(runGh, REPO)

    const advisories = await auditor([closingIssue({ number: 1 })])

    expect(advisories).toHaveLength(1)
    expect(advisories[0]).toContain('skipped')
    expect(advisories[0]).toContain('project')
  })

  it('resolves a foreign closing issue under its own repo, not the audited repo', async () => {
    const key = `${OTHER_REPO}#1`
    const runGh = fakeRunGh(
      { [key]: [{ id: PROJECT_ID, title: PROJECT_TITLE, url: PROJECT_URL }] },
      { [PROJECT_ID]: [] },
    )
    const auditor = createProjectAuditor(runGh, REPO)

    await expect(auditor([closingIssue({ number: 1 }, OTHER_REPO)])).resolves.toEqual([])
  })

  it('issues zero gh calls when there are no closing issues', async () => {
    let calls = 0
    const runGh = (_args: string[]) => {
      calls += 1
      return Promise.resolve('{}')
    }
    const auditor = createProjectAuditor(runGh, REPO)

    await expect(auditor([])).resolves.toEqual([])
    expect(calls).toBe(0)
  })
})
