import { describe, expect, it } from 'vitest'

import type { ReferencedIssue } from '../closing-refs.mts'
import {
  createProjectAuditor,
  formatProjectAdvisories,
  formatProjectAdvisoryReport,
  groupClosedIssuesByProject,
} from '../project-audit.mts'
import type { ProjectRef, ProjectSibling } from '../project-query.mts'
import type { ClosingIssueForAudit } from '../validate.mts'

const REPO = 'jonathanong/filaments'
const OTHER_REPO = 'other/repo'
const PROJECT_A: ProjectRef = { id: 'p-a', title: 'Project A', url: 'https://x/a' }
const PROJECT_B: ProjectRef = { id: 'p-b', title: 'Project B', url: 'https://x/b' }

function referencedIssue(overrides: Partial<ReferencedIssue>): ReferencedIssue {
  return {
    body: '',
    isPullRequest: false,
    number: 0,
    state: 'closed',
    title: '',
    url: '',
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

type MembershipFixture = Record<string, ProjectRef[]>
type ItemsFixture = Record<
  string,
  Array<{ number: number; repo?: string; state?: string; title?: string }>
>

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
    const projects = memberships[key] ?? []
    const nodes = projects.map(project => ({
      project: { closed: false, id: project.id, title: project.title, url: project.url },
    }))
    return Promise.resolve(
      JSON.stringify({ data: { repository: { issue: { projectItems: { nodes } } } } }),
    )
  }
}

describe('groupClosedIssuesByProject', () => {
  it('groups by project id, merging issue keys within the same project', () => {
    const grouped = groupClosedIssuesByProject([
      { closingKey: '#1', projects: [PROJECT_A] },
      { closingKey: '#2', projects: [PROJECT_A] },
    ])
    expect(grouped.size).toBe(1)
    expect(grouped.get(PROJECT_A.id)).toEqual({ keys: new Set(['#1', '#2']), project: PROJECT_A })
  })

  it('audits every project an issue belongs to independently, never picking one arbitrarily', () => {
    const grouped = groupClosedIssuesByProject([
      { closingKey: '#1', projects: [PROJECT_A, PROJECT_B] },
    ])
    expect(grouped.size).toBe(2)
    expect(grouped.get(PROJECT_A.id)).toEqual({ keys: new Set(['#1']), project: PROJECT_A })
    expect(grouped.get(PROJECT_B.id)).toEqual({ keys: new Set(['#1']), project: PROJECT_B })
  })

  it('produces no groups for an issue with no project memberships', () => {
    expect(groupClosedIssuesByProject([{ closingKey: '#1', projects: [] }]).size).toBe(0)
  })
})

describe('formatProjectAdvisories', () => {
  it('mentions the key, title, and project identity, without requiring a disposition', () => {
    const siblings: ProjectSibling[] = [
      {
        key: 'other/repo#9',
        projectTitle: 'Project A',
        projectUrl: 'https://x/a',
        title: 'Stranded ticket',
      },
    ]
    const [message] = formatProjectAdvisories(siblings)
    expect(message).toContain('other/repo#9')
    expect(message).toContain('Stranded ticket')
    expect(message).toContain('Project A')
    expect(message).toContain('https://x/a')
  })
})

describe('formatProjectAdvisoryReport', () => {
  it('is empty when there is nothing to report', () => {
    expect(formatProjectAdvisoryReport([])).toBe('')
  })

  it('renders a non-blocking header above each advisory line', () => {
    const report = formatProjectAdvisoryReport(['#1 is still open'])
    expect(report).toContain('non-blocking')
    expect(report).toContain('#1 is still open')
  })
})

describe('createProjectAuditor', () => {
  it('issues zero gh calls when there are no closing issues', async () => {
    let calls = 0
    const runGh = () => {
      calls += 1
      return Promise.resolve('{}')
    }
    const auditor = createProjectAuditor(runGh, REPO)
    await expect(auditor('Closes #1', [], [])).resolves.toEqual([])
    expect(calls).toBe(0)
  })

  it('produces no advisory when the closed issue belongs to no project', async () => {
    const auditor = createProjectAuditor(fakeRunGh({}), REPO)
    const closingIssues = [closingIssue({ number: 1 })]
    await expect(auditor('Closes #1', [], closingIssues)).resolves.toEqual([])
  })

  it('reports remaining open project items once the remainder is within threshold', async () => {
    const key = `${REPO.toLowerCase()}#1`
    const runGh = fakeRunGh(
      { [key]: [PROJECT_A] },
      { [PROJECT_A.id]: [{ number: 1 }, { number: 2 }, { number: 3, repo: OTHER_REPO }] },
    )
    const auditor = createProjectAuditor(runGh, REPO)
    const closingIssues = [closingIssue({ number: 1 })]
    const advisories = await auditor('Closes #1', [], closingIssues)
    expect(advisories).toHaveLength(2)
    expect(advisories.join('\n')).toContain(`${OTHER_REPO}#3`)
    expect(advisories.join('\n')).toContain(`${REPO.toLowerCase()}#2`)
  })

  it('audits every project an issue belongs to, not just the first', async () => {
    const key = `${REPO.toLowerCase()}#1`
    const runGh = fakeRunGh(
      { [key]: [PROJECT_A, PROJECT_B] },
      { [PROJECT_A.id]: [{ number: 2 }], [PROJECT_B.id]: [{ number: 3 }] },
    )
    const auditor = createProjectAuditor(runGh, REPO)
    const closingIssues = [closingIssue({ number: 1 })]
    const advisories = await auditor('Closes #1', [], closingIssues)
    expect(advisories).toHaveLength(2)
    expect(advisories.some(a => a.includes('Project A'))).toBe(true)
    expect(advisories.some(a => a.includes('Project B'))).toBe(true)
  })

  it('resolves a foreign closing issue under its own repo', async () => {
    const key = `${OTHER_REPO}#1`
    const runGh = fakeRunGh({ [key]: [PROJECT_A] }, { [PROJECT_A.id]: [] })
    const auditor = createProjectAuditor(runGh, REPO)
    const closingIssues = [closingIssue({ number: 1 }, OTHER_REPO)]
    await expect(auditor('Closes other/repo#1', [], closingIssues)).resolves.toEqual([])
  })

  it('collapses the whole audit to a single skipped-audit notice on a scope failure', async () => {
    const runGh = () => Promise.reject(new Error("The 'project' scope is required."))
    const auditor = createProjectAuditor(runGh, REPO)
    const closingIssues = [closingIssue({ number: 1 }), closingIssue({ number: 2 })]
    const advisories = await auditor('Closes #1\nCloses #2', [], closingIssues)
    expect(advisories).toHaveLength(1)
    expect(advisories[0]).toContain('skipped')
    expect(advisories[0]).toContain('project')
  })

  it('degrades a single non-scope membership failure to "no memberships" without failing the rest', async () => {
    const okKey = `${REPO.toLowerCase()}#2`
    const runGh = (args: string[]) => {
      const number = argValue(args, 'number')
      if (number === '1') return Promise.reject(new Error('transient network error'))
      return fakeRunGh({ [okKey]: [PROJECT_A] }, { [PROJECT_A.id]: [] })(args)
    }
    const auditor = createProjectAuditor(runGh, REPO)
    const closingIssues = [closingIssue({ number: 1 }), closingIssue({ number: 2 })]
    await expect(auditor('Closes #1\nCloses #2', [], closingIssues)).resolves.toEqual([])
  })
})
