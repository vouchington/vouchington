import { execFileSync } from 'node:child_process'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { preToolUseOutput } from '../../codex-hooks/policy.mts'
import { gitEnvForCwd } from '../../codex-hooks/policy/github-configured-base.mts'
import { checkoutOwner } from '../../codex-hooks/policy/github-content-rule-scope.mts'
import {
  findGitHubWorkflowBlock,
  type GitHubWorkflowPolicyOptions,
} from '../../codex-hooks/policy-helpers.mts'
import { withTestTempDir } from '../test-temp-root.mts'

// Synthetic owners: the session checkout belongs to `acme`; `widgets-inc` is another owner.
const SESSION = { sessionOwner: () => 'acme' }
const UNREAD_CWD = '/owner-scope-session'
const DRAFT_FIRST = 'New PRs must be opened as draft first'
const CLOSING_KEYWORD = 'PR bodies must include at least one GitHub closing keyword'
const PLAN_TITLE = 'Raw issue creation requires a literal non-Plan title'

const nonDraftPr = (flags: string, prefix = '') =>
  `${prefix}gh pr create ${flags} --title t --body "no refs"`
const planIssue = (flags: string, prefix = '') =>
  `${prefix}gh issue create ${flags} --title "Plan: widgets" --body b`
const editPr = (selector: string, flags = '') => `gh pr edit ${selector} ${flags} --body "no refs"`

function reasonOf(
  command: string,
  cwd = UNREAD_CWD,
  options: GitHubWorkflowPolicyOptions = SESSION,
): string | undefined {
  return findGitHubWorkflowBlock(command, cwd, options)?.reason
}

function git(dir: string, ...args: string[]): void {
  execFileSync('git', args, { cwd: dir, env: gitEnvForCwd(), stdio: 'ignore' })
}

function withRepo<T>(
  remotes: Record<string, string>,
  callback: (dir: string) => T,
  config: Record<string, string> = {},
): Promise<T> {
  return withTestTempDir('voucha-owner-scope-', async dir => {
    git(dir, 'init', '-q')
    for (const [name, url] of Object.entries(remotes)) {
      git(dir, 'remote', 'add', name, url)
    }
    for (const [key, value] of Object.entries(config)) {
      git(dir, 'config', key, value)
    }
    return callback(dir)
  })
}

const WIDGETS_REMOTE = { origin: 'git@github.com:widgets-inc/tool.git' }

describe('gh content-rule owner scope', () => {
  beforeEach(() => {
    // A developer's own gitconfig (url.insteadOf rewrites) or GH_REPO must not leak in. GH_REPO is
    // stubbed empty, which gh treats as unset: stubbing `undefined` doesn't unset in this project (#435).
    vi.stubEnv('GIT_CONFIG_GLOBAL', '/dev/null')
    vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1')
    vi.stubEnv('GH_REPO', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('content rules skip a provably other-owner target', () => {
    it.each([
      ['--repo', '--repo widgets-inc/tool', ''],
      ['-R with a host and another case', '-R github.com/Widgets-Inc/tool', ''],
      ['a repository URL', '--repo https://github.com/widgets-inc/tool', ''],
      ['a GH_REPO prefix', '', 'GH_REPO=widgets-inc/tool '],
      [
        '--repo overriding an exported GH_REPO',
        '--repo widgets-inc/tool',
        'export GH_REPO=acme/app; ',
      ],
    ])('via %s', (_name, flags, prefix) => {
      expect(reasonOf(nonDraftPr(flags, prefix))).toBeUndefined()
      expect(reasonOf(planIssue(flags, prefix))).toBeUndefined()
    })

    it('reads -R before the subcommand', () => {
      expect(reasonOf('gh -R widgets-inc/tool pr create --title t --body x')).toBeUndefined()
    })

    it('reads the invocation cwd remotes, including after a literal cd', async () => {
      await withRepo(WIDGETS_REMOTE, dir => {
        expect(reasonOf(nonDraftPr(''), dir)).toBeUndefined()
        expect(reasonOf(nonDraftPr('', `cd ${dir} && `))).toBeUndefined()
        expect(reasonOf(planIssue('', `cd ${dir} && `))).toBeUndefined()
      })
    })

    it.each([
      ['a set-default of `base`', { 'remote.origin.gh-resolved': 'base' }, {}],
      ['a hostless remote', {}, { mirror: '/srv/git/tool.git' }],
    ])('keeps the remote owner with %s', async (_name, config, extraRemotes) => {
      await withRepo(
        { ...WIDGETS_REMOTE, ...extraRemotes },
        dir => expect(reasonOf(nonDraftPr(''), dir)).toBeUndefined(),
        config,
      )
    })

    it('falls through to the cwd for an unset or empty GH_REPO prefix', async () => {
      vi.stubEnv('GH_REPO', 'acme/app')
      await withRepo(WIDGETS_REMOTE, dir => {
        expect(reasonOf(nonDraftPr(''), dir)).toContain(DRAFT_FIRST)
        expect(reasonOf(nonDraftPr('', 'env -u GH_REPO '), dir)).toBeUndefined()
        expect(reasonOf(nonDraftPr('', 'GH_REPO= '), dir)).toBeUndefined()
      })
    })

    it('ignores a PR body or title value that looks like a selector', () => {
      const command =
        'gh pr edit 5 --repo widgets-inc/tool --title "$TITLE" --body https://github.com/acme/app/pull/1'
      expect(reasonOf(command)).toBeUndefined()
    })

    it('accepts a literal PR URL selector on the other owner', async () => {
      await withRepo(WIDGETS_REMOTE, dir => {
        expect(reasonOf(editPr('https://github.com/widgets-inc/tool/pull/5'), dir)).toBeUndefined()
      })
    })
  })

  describe('content rules stay on without proof of another owner', () => {
    it.each([
      ['the session owner', '--repo acme/app', ''],
      ['the session owner in another case', '--repo ACME/app', ''],
      ['an expanded owner', '--repo "$OWNER/tool"', ''],
      ['an expanded repository segment', '--repo "widgets-inc/$REPO"', ''],
      ['a malformed selector', '--repo widgets-inc', ''],
      ['an expanded GH_REPO prefix', '', 'GH_REPO="$TARGET" '],
      ['a GH_REPO exported outside the prefix', '', 'export GH_REPO=acme/app; '],
      ['a GH_REPO prefix for the session owner', '', 'GH_REPO=acme/app '],
    ])('for %s', (_name, flags, prefix) => {
      expect(reasonOf(nonDraftPr(flags, prefix))).toContain(DRAFT_FIRST)
      expect(reasonOf(planIssue(flags, prefix))).toContain(PLAN_TITLE)
    })

    it.each([
      ['a second owner', { upstream: 'https://github.com/acme/tool.git' }, {}],
      ['a set-default on the session owner', {}, { 'remote.origin.gh-resolved': 'acme/tool' }],
      ['an unparseable hosted remote', { lab: 'https://gitlab.example/group/sub/tool.git' }, {}],
    ])('for cwd remotes with %s', async (_name, extraRemotes, config) => {
      await withRepo(
        { ...WIDGETS_REMOTE, ...extraRemotes },
        dir => expect(reasonOf(nonDraftPr(''), dir)).toContain(DRAFT_FIRST),
        config,
      )
    })

    it('for a cwd without remotes, outside a repository, or behind an unresolved cd', async () => {
      await withRepo({}, dir => expect(reasonOf(nonDraftPr(''), dir)).toContain(DRAFT_FIRST))
      await withTestTempDir('voucha-owner-scope-plain-', async dir => {
        expect(reasonOf(nonDraftPr(''), dir)).toContain(DRAFT_FIRST)
      })
      await withRepo(WIDGETS_REMOTE, dir => {
        expect(reasonOf(nonDraftPr('', 'cd "$DIR" && '), dir)).toContain(DRAFT_FIRST)
      })
    })

    it('for a PR URL selector on the session owner from an other-owner checkout', async () => {
      await withRepo(WIDGETS_REMOTE, dir => {
        expect(reasonOf(editPr('https://github.com/acme/app/pull/5'), dir)).toContain(
          CLOSING_KEYWORD,
        )
      })
    })

    it('for an expanded or non-PR URL selector', () => {
      expect(reasonOf(editPr('"$PR"', '--repo widgets-inc/tool'))).toContain(CLOSING_KEYWORD)
      expect(
        reasonOf(editPr('https://github.com/widgets-inc', '--repo widgets-inc/tool')),
      ).toContain(CLOSING_KEYWORD)
    })

    it('without an injected or provable session owner', () => {
      const command = nonDraftPr('--repo widgets-inc/tool')
      expect(reasonOf(command, UNREAD_CWD, {})).toContain(DRAFT_FIRST)
      expect(reasonOf(command, UNREAD_CWD, { sessionOwner: () => undefined })).toContain(
        DRAFT_FIRST,
      )
    })
  })

  describe('global rules ignore the owner scope', () => {
    it.each([
      ['gh pr merge', 'gh pr merge 5 --repo widgets-inc/tool --squash'],
      ['gh api merge', 'gh api -X PUT repos/widgets-inc/tool/pulls/5/merge'],
      ['gh stack', 'gh stack switch --repo widgets-inc/tool'],
    ])('%s still blocks for another owner', (_name, command) => {
      expect(reasonOf(command)).toBeDefined()
    })

    it('never reads the session owner for other gh commands', () => {
      const sessionOwner = vi.fn<() => string | undefined>(() => 'acme')
      findGitHubWorkflowBlock('gh pr merge 5 --repo widgets-inc/tool', UNREAD_CWD, { sessionOwner })
      findGitHubWorkflowBlock('gh pr view 5 --repo widgets-inc/tool', UNREAD_CWD, { sessionOwner })
      expect(sessionOwner).not.toHaveBeenCalled()
    })
  })

  describe('preToolUseOutput threads the session owner', () => {
    const payload = { tool_input: { command: nonDraftPr('--repo widgets-inc/tool') } }

    it('allows another owner only when the session owner is injected and differs', () => {
      expect(preToolUseOutput(payload, { sessionOwner: () => 'acme' })).toBe('')
      expect(JSON.parse(preToolUseOutput(payload, { sessionOwner: () => 'widgets-inc' }))).toEqual({
        decision: 'block',
        reason: expect.stringContaining(DRAFT_FIRST),
      })
      expect(JSON.parse(preToolUseOutput(payload)).reason).toContain(DRAFT_FIRST)
    })
  })

  describe('checkoutOwner', () => {
    it.each([
      ['an scp-like URL in another case', 'git@github.com:Widgets-Inc/tool.git'],
      ['an https URL', 'https://github.com/widgets-inc/tool.git'],
      ['an ssh URL with a port', 'ssh://git@github.com:22/widgets-inc/tool.git'],
      ['a trailing slash', 'https://github.com/widgets-inc/tool/'],
    ])('reads %s', async (_name, url) => {
      await withRepo({ origin: url }, dir => expect(checkoutOwner(dir)).toBe('widgets-inc'))
    })

    it('reads the fetch URL, not a push URL', async () => {
      await withRepo(WIDGETS_REMOTE, dir => {
        git(dir, 'remote', 'set-url', '--push', 'origin', 'git@github.com:acme/tool.git')
        expect(checkoutOwner(dir)).toBe('widgets-inc')
      })
    })

    it.each([
      [
        'only hostless remotes',
        { origin: '/srv/git/tool.git', mirror: 'file:///srv/git/tool.git' },
      ],
      ['an owner-less hosted URL', { origin: 'https://github.com/tool.git' }],
    ])('is undefined for %s', async (_name, remotes) => {
      await withRepo(remotes, dir => expect(checkoutOwner(dir)).toBeUndefined())
    })
  })
})
