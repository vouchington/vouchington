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

import { VALID_PR_BODY } from './test-helpers/pr-description/valid-pr-body.mts'
import { validatePullRequest } from './agent-policy.mts'

const REPO = 'vouchington/vouchington'
const thresholds = { added: 2, deleted: 2 }
const base = {
  title: 't',
  body: VALID_PR_BODY,
  base: 'main',
  head: 'feature',
  mode: 'interactive',
} as const

function diff(added: number) {
  gh.processDiffCommand.mockImplementation(async (_command, onBlock) => {
    onBlock(Array.from({ length: added }, () => '+line').join('\n'))
  })
}

function acknowledged(text: string) {
  return VALID_PR_BODY.replace('Workspace setup:', `### Large diff\n\n${text}\n\nWorkspace setup:`)
}

describe('validatePullRequest large-diff gate', () => {
  beforeEach(() => {
    gh.runGh.mockReset()
    gh.processDiffCommand.mockReset()
    gh.runGh.mockImplementation(async args => {
      if (args[0] === 'repo') return JSON.stringify({ nameWithOwner: REPO })
      return JSON.stringify({
        body: '',
        html_url: `https://github.com/${REPO}/issues/123`,
        milestone: null,
        number: 123,
        state: 'open',
        title: 'Issue 123',
      })
    })
  })

  it('measures the branch against origin/<base> and passes within the thresholds', async () => {
    diff(2)
    expect((await validatePullRequest(base, { thresholds })).errors).toEqual([])
    expect(gh.processDiffCommand).toHaveBeenCalledWith(
      { executable: 'git', args: ['diff', 'origin/main...HEAD'] },
      expect.any(Function),
    )
  })

  it('refuses an over-threshold create without the acknowledgement section', async () => {
    diff(3)
    const errors = (await validatePullRequest(base, { thresholds })).errors.join('\n')
    expect(errors).toContain('adds 3 and deletes 0 lines against origin/main')
    expect(errors).toContain('### Large diff')
  })

  it('accepts the acknowledgement section but not an empty one', async () => {
    diff(3)
    const ok = await validatePullRequest(
      { ...base, body: acknowledged('Lockfile refresh; splitting would not help.') },
      { thresholds },
    )
    expect(ok.errors).toEqual([])
    const empty = await validatePullRequest({ ...base, body: acknowledged('') }, { thresholds })
    expect(empty.errors.join('\n')).toContain('### Large diff')
  })

  it.each([
    ['a fenced example', acknowledged('```\nhidden\n```')],
    ['an HTML comment', acknowledged('<!-- hidden -->')],
    ['an indented heading', acknowledged(' ### Next section')],
    [
      'a heading inside a fence',
      VALID_PR_BODY.replace(
        'Workspace setup:',
        '```\n### Large diff\nhidden\n```\n\nWorkspace setup:',
      ),
    ],
  ])('refuses an acknowledgement hidden in %s', async (_name, body) => {
    diff(3)
    const result = await validatePullRequest({ ...base, body }, { thresholds })
    expect(result.errors.join('\n')).toContain('### Large diff')
  })

  it('does not gate updates', async () => {
    diff(3)
    gh.runGh.mockImplementation(async args => {
      if (args[0] === 'repo') return JSON.stringify({ nameWithOwner: REPO })
      if (args[0] === 'pr')
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
    const result = await validatePullRequest({ ...base, pr: 7 }, { thresholds })
    expect(result.errors.join('\n')).not.toContain('Large diff')
  })

  it('warns instead of blocking when the diff cannot be measured', async () => {
    gh.processDiffCommand.mockRejectedValue(new Error('no origin/main'))
    const result = await validatePullRequest(base, { thresholds })
    expect(result.errors).toEqual([])
    expect(result.warnings?.join('\n')).toContain('diff checks skipped: no origin/main')
  })

  it('returns injected supersession hints as warnings and survives a failed search', async () => {
    diff(1)
    const hinted = await validatePullRequest(base, {
      thresholds,
      supersessionHints: async summary => `hint for ${summary.lineChanges.added} added`,
    })
    expect(hinted.errors).toEqual([])
    expect(hinted.warnings).toContain('hint for 1 added')
    const failed = await validatePullRequest(base, {
      thresholds,
      supersessionHints: async () => {
        throw new Error('search down')
      },
    })
    expect(failed.errors).toEqual([])
    expect(failed.warnings?.join('\n')).toContain('Supersession search failed: search down')
  })
})
