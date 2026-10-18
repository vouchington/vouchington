import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { findGitHubWorkflowBlock } from '../../codex-hooks/policy-helpers.mts'
import { withRepo } from '../git-remote-repo.mts'

const SESSION = { sessionRepositories: () => new Set(['acme/app']) }
const nonDraftPr = (flags: string, prefix = '') =>
  `${prefix}gh pr create ${flags} --title t --body "no refs"`
const editPr = (selector: string, flags = '') => `gh pr edit ${selector} ${flags} --body "no refs"`
const reasonOf = (command: string, cwd = '/repository-scope-session') =>
  findGitHubWorkflowBlock(command, cwd, SESSION)?.reason

describe('same-owner repositories keep their own content policy', () => {
  beforeEach(() => {
    vi.stubEnv('GIT_CONFIG_GLOBAL', '/dev/null')
    vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1')
    vi.stubEnv('GH_REPO', '')
    vi.stubEnv('GH_HOST', '')
  })

  afterEach(() => vi.unstubAllEnvs())

  it.each([
    ['--repo', '--repo github.com/acme/platform', ''],
    ['GH_REPO', '', 'GH_HOST=github.com GH_REPO=acme/platform '],
  ])('allows a sibling repository via %s', (_name, flags, prefix) => {
    expect(reasonOf(nonDraftPr(flags, prefix))).toBeUndefined()
  })

  it('uses inherited GH_REPO for a sibling repository', () => {
    vi.stubEnv('GH_HOST', 'github.com')
    vi.stubEnv('GH_REPO', 'acme/platform')
    expect(reasonOf(nonDraftPr(''))).toBeUndefined()
  })

  it('allows an implicit sibling checkout and its matching PR URL', async () => {
    vi.stubEnv('GH_HOST', 'github.com')
    await withRepo({ origin: 'git@github.com:acme/platform.git' }, dir => {
      expect(reasonOf(nonDraftPr(''), dir)).toBeUndefined()
      expect(reasonOf(editPr('https://github.com/acme/platform/pull/5'), dir)).toBeUndefined()
    })
  })

  it('requires the effective GH_HOST for hostless selectors and cwd', async () => {
    vi.stubEnv('GH_HOST', 'other.example')
    expect(reasonOf(nonDraftPr('--repo acme/platform'))).toBeDefined()
    expect(reasonOf(nonDraftPr('--repo https://acme/platform'))).toBeDefined()
    expect(reasonOf(nonDraftPr('', 'GH_REPO=acme/platform '))).toBeDefined()
    expect(reasonOf(nonDraftPr('--repo github.com/acme/platform'))).toBeUndefined()
    expect(reasonOf(nonDraftPr('--repo https://github.com/acme/platform'))).toBeUndefined()
    expect(reasonOf(nonDraftPr('--repo acme/platform', 'GH_HOST=github.com '))).toBeUndefined()
    expect(reasonOf(nonDraftPr('--repo acme/platform', 'env -u GH_HOST '))).toBeDefined()
    await withRepo({ origin: 'git@github.com:acme/platform.git' }, dir => {
      expect(reasonOf(nonDraftPr(''), dir)).toBeDefined()
    })
  })

  it('requires explicit github.com when GH_HOST is unset for hostless selectors', () => {
    expect(reasonOf(nonDraftPr('--repo acme/platform'))).toBeDefined()
    expect(reasonOf(nonDraftPr('', 'GH_REPO=acme/platform '))).toBeDefined()
    vi.stubEnv('GH_HOST', 'github.com')
    expect(reasonOf(nonDraftPr('--repo acme/platform'))).toBeUndefined()
    expect(reasonOf(nonDraftPr('', 'GH_REPO=acme/platform '))).toBeUndefined()
  })

  it('preserves .git in non-URL gh repository selectors', () => {
    vi.stubEnv('GH_HOST', 'github.com')
    expect(reasonOf(nonDraftPr('--repo acme/app.git'))).toBeUndefined()
    expect(reasonOf(nonDraftPr('--repo github.com/acme/app.git'))).toBeUndefined()
    expect(reasonOf(nonDraftPr('--repo https://github.com/acme/app.git'))).toContain('pr_create')
  })

  it.each(['GH_HOST=other.example ', 'GH_HOST="$HOST" ', 'export GH_HOST=other.example; '])(
    'keeps rules when a prefix can change the host: %s',
    async prefix => {
      expect(reasonOf(nonDraftPr('--repo acme/platform', prefix))).toBeDefined()
      expect(reasonOf(nonDraftPr('', `${prefix}GH_REPO=acme/platform `))).toBeDefined()
      await withRepo({ origin: 'git@github.com:acme/platform.git' }, dir => {
        expect(reasonOf(nonDraftPr('', prefix), dir)).toBeDefined()
      })
    },
  )

  it('lets a literal PR URL select the edit target ahead of cwd or --repo', () => {
    expect(
      reasonOf(editPr('https://github.com/acme/platform/pull/5', '--repo acme/app')),
    ).toBeUndefined()
    expect(
      reasonOf(editPr('https://github.com/acme/another/pull/5', '--repo acme/platform')),
    ).toBeUndefined()
    expect(
      reasonOf(editPr('https://other.example/acme/platform/pull/5', '--repo acme/platform')),
    ).toContain('pr_update')
    expect(
      findGitHubWorkflowBlock(
        editPr('https://github.com/acme/app.git/pull/5'),
        '/repository-scope-session',
        {
          sessionRepositories: () => new Set(['acme/app.git']),
        },
      )?.reason,
    ).toContain('pr_update')
    expect(reasonOf(editPr('5 --add-label https://github.com/acme/platform/pull/5'))).toContain(
      'pr_update',
    )
    expect(reasonOf(editPr('5 --attach https://github.com/acme/platform/pull/5'))).toContain(
      'pr_update',
    )
    expect(reasonOf(editPr('5 --unknown https://github.com/acme/platform/pull/5'))).toContain(
      'pr_update',
    )
    expect(reasonOf(editPr('5 https://github.com/acme/platform/pull/5'))).toContain('pr_update')
  })
})
