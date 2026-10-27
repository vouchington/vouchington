import { beforeEach, describe, expect, it, vi } from 'vitest'

const gh = vi.hoisted(() => ({
  runGh: vi.fn<(args: string[]) => Promise<string>>(),
  processDiffCommand:
    vi.fn<(command: unknown, onBlock: (block: string) => void) => Promise<void>>(),
}))

vi.mock<typeof import('vouchington-tooling/gh-cli')>(
  import('vouchington-tooling/gh-cli'),
  async importOriginal => ({ ...(await importOriginal()), ...gh }),
)

import { DiffCommandError } from 'vouchington-tooling/gh-cli'

import { VALID_PR_BODY } from './test-helpers/pr-description/valid-pr-body.mts'
import { pullRequestDefaults, validatePullRequest } from './agent-policy.mts'

const REPO = 'vouchington/vouchington'
const PROJECT = {
  id: 'P1',
  title: 'Roadmap',
  url: 'https://github.com/orgs/x/projects/1',
  closed: false,
}

function issueJson(number: number, milestone: string | null) {
  return JSON.stringify({
    body: '',
    html_url: `https://github.com/${REPO}/issues/${number}`,
    milestone: milestone === null ? null : { title: milestone },
    number,
    state: 'open',
    title: `Issue ${number}`,
  })
}

function install(options: { milestone?: string; projects?: unknown[]; failIssue?: boolean } = {}) {
  gh.runGh.mockImplementation(async args => {
    const [a, b] = args
    if (a === 'repo') return JSON.stringify({ nameWithOwner: REPO })
    if (a === 'api' && b === 'graphql') {
      const nodes = (options.projects ?? []).map(project => ({ project }))
      return JSON.stringify({ data: { repository: { issue: { projectItems: { nodes } } } } })
    }
    if (a === 'api' && b?.startsWith('repos/')) {
      if (options.failIssue) throw new Error('boom')
      return issueJson(Number(b.split('/').at(-1)), options.milestone ?? null)
    }
    if (a === 'pr' && b === 'view')
      return JSON.stringify({
        baseRefOid: 'b',
        headRefOid: 'h',
        mergeCommit: null,
        number: 7,
        state: 'OPEN',
        url: `https://github.com/${REPO}/pull/7`,
      })
    return '[]'
  })
  gh.processDiffCommand.mockResolvedValue(undefined)
}

const base = {
  title: 't',
  body: VALID_PR_BODY,
  base: 'main',
  head: 'feature',
  mode: 'interactive',
} as const

describe('validatePullRequest', () => {
  beforeEach(() => {
    gh.runGh.mockReset()
    gh.processDiffCommand.mockReset()
  })

  it('reports content-policy errors without calling gh', async () => {
    const { errors } = await validatePullRequest({ ...base, body: '## Summary\n\nx\n' })
    expect(errors.join('\n')).toContain('## Related issues')
    expect(gh.runGh).not.toHaveBeenCalled()
  })

  it('accepts a valid body on create and warns with the referenced issue', async () => {
    install()
    const result = await validatePullRequest(base)
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([expect.stringContaining('#123 OPEN issue: Issue 123')])
    // Create measures only the local branch diff; the PR diff reads need an existing PR.
    expect(gh.processDiffCommand).toHaveBeenCalledOnce()
    const calls = gh.runGh.mock.calls.map(([args]) => `${args[0]} ${args[1]}`)
    expect(calls).not.toContain('pr view')
    expect(calls).not.toContain('api graphql')
  })

  it('accepts the H2 body the pr_create tool renders', async () => {
    install()
    const body = [
      '## Summary',
      '',
      'Brief summary.',
      '',
      '## Impact',
      '',
      'Developers get actionable PR descriptions; product behavior is unchanged.',
      '',
      '## Related issues',
      '',
      '- Closes #123 — resolved here',
      '',
      '## Details',
      '',
      'Details.',
      '',
      'Workspace setup: ./dev/initialize monorepo',
      'Agent: claude-code (opus) session 11111111-1111-1111-1111-111111111111',
      'Device: test@test-host',
      'Worktree: test-worktree',
      '',
    ].join('\n')
    expect((await validatePullRequest({ ...base, body })).errors).toEqual([])
    const h3 = body.replaceAll('## ', '### ')
    expect((await validatePullRequest({ ...base, body: h3 })).errors.join('\n')).toContain(
      '## Related issues',
    )
  })

  it('blocks a non-main base on create but not on update', async () => {
    install()
    const create = await validatePullRequest({ ...base, base: 'feature-parent' })
    expect(create.errors).toEqual([expect.stringContaining('PRs must target main')])
    const content = await validatePullRequest({
      ...base,
      base: 'feature-parent',
      body: '## Summary\n\nx\n',
    })
    expect(content.errors.at(-1)).toContain('PRs must target main')
    expect((await validatePullRequest({ ...base, base: 'feature-parent', pr: 7 })).errors).toEqual(
      [],
    )
  })

  it('reports an unresolvable closing reference', async () => {
    install({ failIssue: true })
    const { errors } = await validatePullRequest(base)
    expect(errors.join('\n')).toContain('#123')
  })

  it('checks the existing PR diff when pr is set', async () => {
    install()
    const result = await validatePullRequest({ ...base, pr: 7 })
    expect(result.errors).toEqual([])
    expect(gh.processDiffCommand).toHaveBeenCalledOnce()
    expect(gh.runGh).toHaveBeenCalledWith(expect.arrayContaining(['pr', 'view', '7']))
    expect(gh.runGh).toHaveBeenCalledWith(expect.arrayContaining(['api', 'graphql']))
  })
})

describe('validatePullRequest on an oversized diff', () => {
  it('falls back to the files API and warns', async () => {
    install()
    const inner = gh.runGh.getMockImplementation()!
    gh.runGh.mockImplementation(async args => (args[1]?.endsWith('/files') ? '[]' : inner(args)))
    gh.processDiffCommand.mockRejectedValue(
      new DiffCommandError({ executable: 'gh', args: [] }, { code: 1, stderr: 'HTTP 406' }),
    )
    const result = await validatePullRequest({ ...base, pr: 7 })
    expect(result.errors).toEqual([])
    expect(result.warnings?.join('\n')).toContain('GitHub refused the oversized unified PR diff')
  })
})

describe('pullRequestDefaults', () => {
  beforeEach(() => {
    gh.runGh.mockReset()
    gh.processDiffCommand.mockReset()
  })

  const issues = (...numbers: number[]) =>
    numbers.map(number => ({ number, relation: 'refs' as const, reason: 'r' }))

  it('returns only the repository without related issues', async () => {
    expect(await pullRequestDefaults({ title: 't', base: 'main', relatedIssues: [] })).toEqual({
      repositories: [REPO],
    })
    expect(await pullRequestDefaults()).toEqual({ repositories: [REPO] })
    // retrospective_save passes an empty object, not the pr_create input.
    expect(await pullRequestDefaults({})).toEqual({ repositories: [REPO] })
    expect(gh.runGh).not.toHaveBeenCalled()
  })

  it('inherits the milestone and the single open project of the source issue', async () => {
    install({ milestone: 'Agent tooling MCP server', projects: [PROJECT] })
    const defaults = await pullRequestDefaults({
      title: 't',
      base: 'main',
      relatedIssues: issues(5),
    })
    expect(defaults).toEqual({
      milestone: 'Agent tooling MCP server',
      project: 'Roadmap',
      repositories: [REPO],
    })
  })

  it('omits the project when its memberships cannot be read', async () => {
    install({ milestone: 'M' })
    const inner = gh.runGh.getMockImplementation()!
    gh.runGh.mockImplementation(async args => {
      if (args[1] === 'graphql') throw new Error('no project scope')
      return inner(args)
    })
    expect(
      await pullRequestDefaults({ title: 't', base: 'main', relatedIssues: issues(5) }),
    ).toEqual({ milestone: 'M', repositories: [REPO] })
  })

  it('looks at closing issues before refs and omits ambiguous projects', async () => {
    install({ projects: [PROJECT, { ...PROJECT, id: 'P2' }] })
    const relatedIssues = [
      { number: 1, relation: 'refs' as const, reason: 'r' },
      { number: 2, relation: 'closes' as const, reason: 'r' },
    ]
    const defaults = await pullRequestDefaults({ title: 't', base: 'main', relatedIssues })
    expect(defaults).toEqual({ repositories: [REPO] })
    const urls = gh.runGh.mock.calls.map(([args]) => args[1]).filter(a => a?.startsWith('repos/'))
    expect(urls).toEqual([`repos/${REPO}/issues/2`, `repos/${REPO}/issues/1`])
  })

  it('keeps metadata from other issues when one lookup fails', async () => {
    install({ milestone: 'M', projects: [PROJECT] })
    const inner = gh.runGh.getMockImplementation()!
    gh.runGh.mockImplementation(async args => {
      if (args[1] === `repos/${REPO}/issues/9`) throw new Error('deleted')
      return inner(args)
    })
    const relatedIssues = [
      { number: 9, relation: 'closes' as const, reason: 'r' },
      { number: 5, relation: 'refs' as const, reason: 'r' },
    ]
    expect(await pullRequestDefaults({ title: 't', base: 'main', relatedIssues })).toEqual({
      milestone: 'M',
      project: 'Roadmap',
      repositories: [REPO],
    })
  })

  it('ignores related issues from another repository', async () => {
    install({ milestone: 'M' })
    const relatedIssues = [
      { number: 3, relation: 'refs' as const, reason: 'r', repository: 'vouchington/other' },
    ]
    expect(await pullRequestDefaults({ title: 't', base: 'main', relatedIssues })).toEqual({
      repositories: [REPO],
    })
    const urls = gh.runGh.mock.calls.map(([args]) => args[1]).filter(a => a?.startsWith('repos/'))
    expect(urls).toEqual([])
  })

  it('omits metadata when GitHub lookups fail', async () => {
    install({ failIssue: true })
    expect(
      await pullRequestDefaults({ title: 't', base: 'main', relatedIssues: issues(5) }),
    ).toEqual({ repositories: [REPO] })
  })
})
