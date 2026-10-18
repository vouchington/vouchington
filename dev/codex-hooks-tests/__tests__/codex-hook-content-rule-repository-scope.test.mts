import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { preToolUseOutput } from '../../codex-hooks/policy.mts'
import {
  findGitHubWorkflowBlock,
  type GitHubWorkflowPolicyOptions,
} from '../../codex-hooks/policy-helpers.mts'
import { withRepo } from '../git-remote-repo.mts'
import { withTestTempDir } from '../test-temp-root.mts'

// The session belongs to acme/app; widgets-inc/tool is a foreign repository.
const SESSION = { sessionRepositories: () => new Set(['acme/app']) }
const UNREAD_CWD = '/repository-scope-session'
const DRAFT_FIRST = 'pr_create'
const CLOSING_KEYWORD = 'pr_update'
const TARGET_MAIN = 'PRs must target main'

const nonDraftPr = (flags: string, prefix = '') =>
  `${prefix}gh pr create ${flags} --title t --body "no refs"`
const editPr = (selector: string, flags = '') => `gh pr edit ${selector} ${flags} --body "no refs"`

function reasonOf(
  command: string,
  cwd = UNREAD_CWD,
  options: GitHubWorkflowPolicyOptions = SESSION,
): string | undefined {
  return findGitHubWorkflowBlock(command, cwd, options)?.reason
}

const WIDGETS_REMOTE = { origin: 'git@github.com:widgets-inc/tool.git' }

describe('gh content-rule repository scope', () => {
  beforeEach(() => {
    // A developer's own gitconfig (url.insteadOf rewrites) or GH_REPO must not leak in. GH_REPO is
    // stubbed empty, which gh treats as unset: stubbing `undefined` doesn't unset in this project (#435).
    vi.stubEnv('GIT_CONFIG_GLOBAL', '/dev/null')
    vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1')
    vi.stubEnv('GH_REPO', '')
    vi.stubEnv('GH_HOST', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('content rules skip a provably other-repository target', () => {
    it.each([
      ['--repo', '--repo widgets-inc/tool', ''],
      ['-R with a host and another case', '-R github.com/Widgets-Inc/tool', ''],
      ['a repository URL', '--repo https://github.com/widgets-inc/tool', ''],
      ['a GH_REPO prefix', '', 'GH_REPO=widgets-inc/tool '],
      [
        '--repo overriding an exported GH_REPO',
        '--repo github.com/widgets-inc/tool',
        'export GH_REPO=acme/app; ',
      ],
      [
        '--repo behind command wrappers',
        '--repo github.com/widgets-inc/tool',
        'env -C /srv/home nohup ',
      ],
    ])('via %s', (_name, flags, prefix) => {
      expect(reasonOf(nonDraftPr(flags, prefix))).toBeUndefined()
    })

    it('reads -R before the subcommand', () => {
      expect(reasonOf('gh -R widgets-inc/tool pr create --title t --body x')).toBeUndefined()
    })

    it('covers the --base rule and the pr new alias', () => {
      const base = (repo: string) => `gh pr edit 5 --repo ${repo} --base develop`
      expect(reasonOf(base('widgets-inc/tool'))).toBeUndefined()
      expect(reasonOf(base('acme/app'))).toContain(TARGET_MAIN)
      const alias = (repo: string) => `gh pr new --repo ${repo} --title t --body x`
      expect(reasonOf(alias('widgets-inc/tool'))).toBeUndefined()
      expect(reasonOf(alias('acme/app'))).toContain(DRAFT_FIRST)
    })

    it('reads a literal target inside a nested shell command', () => {
      expect(
        reasonOf(`bash -c '${nonDraftPr('--repo github.com/widgets-inc/tool')}'`),
      ).toBeUndefined()
      expect(reasonOf(`bash -c '${nonDraftPr('--repo acme/app')}'`)).toContain(DRAFT_FIRST)
    })

    it('reads the invocation cwd remotes, including after a literal cd', async () => {
      await withRepo(WIDGETS_REMOTE, dir => {
        expect(reasonOf(nonDraftPr(''), dir)).toBeUndefined()
        expect(reasonOf(nonDraftPr('', `cd ${dir} && `))).toBeUndefined()
      })
    })

    it.each([
      ['a set-default of `base`', { 'remote.origin.gh-resolved': 'base' }, {}],
      ['a hostless remote', {}, { mirror: '/srv/git/tool.git' }],
    ])('keeps the remote repository with %s', async (_name, config, extraRemotes) => {
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

    it('accepts a literal PR URL selector on the other repository', async () => {
      await withRepo(WIDGETS_REMOTE, dir => {
        expect(reasonOf(editPr('https://github.com/widgets-inc/tool/pull/5'), dir)).toBeUndefined()
      })
    })
  })

  describe('content rules stay on without proof of another repository', () => {
    it.each([
      ['the session repository', '--repo acme/app', ''],
      ['the session repository in another case', '--repo ACME/app', ''],
      ['an expanded owner', '--repo "$OWNER/tool"', ''],
      ['an expanded repository segment', '--repo "widgets-inc/$REPO"', ''],
      ['an unknown host', '--repo other.example/acme/platform', ''],
      ['an invalid repository name', '--repo acme/..', ''],
      ['a malformed selector', '--repo widgets-inc', ''],
      ['an expanded GH_REPO prefix', '', 'GH_REPO="$TARGET" '],
      ['a GH_REPO exported outside the prefix', '', 'export GH_REPO=acme/app; '],
      ['a GH_REPO prefix for the session repository', '', 'GH_REPO=acme/app '],
      ['a GH_REPO prefix on an earlier command', '', 'GH_REPO=widgets-inc/tool true && '],
      ['a GH_REPO that env -i clears', '', 'GH_REPO=widgets-inc/tool env -i PATH=/usr/bin '],
      ['a GH_REPO that env - clears', '', 'GH_REPO=widgets-inc/tool env - PATH=/usr/bin '],
      ['a GH_REPO append', '', 'GH_REPO+=widgets-inc/tool '],
      ['a GH_REPO array element', '', 'GH_REPO[0]=widgets-inc/tool '],
      ['a GH_REPO prefix behind env -C', '', 'env -C /srv/home GH_REPO=widgets-inc/tool '],
      ['a GH_REPO prefix before another wrapper', '', 'GH_REPO=widgets-inc/tool nohup '],
    ])('for %s', (_name, flags, prefix) => {
      expect(reasonOf(nonDraftPr(flags, prefix))).toContain(DRAFT_FIRST)
    })

    it.each([
      [
        'two repositories under one owner',
        { upstream: 'https://github.com/widgets-inc/another.git' },
        {},
      ],
      ['an unknown host', { lab: 'https://other.example/acme/platform.git' }, {}],
      ['a second owner', { upstream: 'https://github.com/acme/tool.git' }, {}],
      [
        'a partial-clone second owner',
        { upstream: 'https://github.com/acme/tool.git' },
        { 'remote.upstream.partialclonefilter': 'blob:none' },
      ],
      ['a set-default on the session repository', {}, { 'remote.origin.gh-resolved': 'acme/tool' }],
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

    it('for a cwd a nested command, pushd, a git environment, or the same command can change', async () => {
      await withRepo(WIDGETS_REMOTE, dir => {
        expect(reasonOf(`cd /srv/home && bash -c '${nonDraftPr('')}'`, dir)).toContain(DRAFT_FIRST)
        expect(reasonOf(nonDraftPr('', 'pushd /srv/home && '), dir)).toContain(DRAFT_FIRST)
        expect(reasonOf(nonDraftPr('', 'GIT_DIR=/srv/home/.git '), dir)).toContain(DRAFT_FIRST)
        expect(reasonOf(nonDraftPr('', 'export GIT_WORK_TREE=/srv/home; '), dir)).toContain(
          DRAFT_FIRST,
        )
        const setUrl = 'git remote set-url origin https://github.com/acme/app.git && '
        expect(reasonOf(nonDraftPr('', setUrl), dir)).toContain(DRAFT_FIRST)
        expect(reasonOf(nonDraftPr('', 'gh repo set-default acme/app && '), dir)).toContain(
          DRAFT_FIRST,
        )
      })
    })

    it.each([
      ['a short-circuited cd', (other: string) => `false && cd ${other}; `],
      [
        'a zsh last-pipeline cd',
        (other: string, home: string) => `cd ${other} && : | cd ${home}; `,
      ],
      ['builtin cd', (other: string, home: string) => `cd ${other} && builtin cd ${home} && `],
      ['an eval cd', (other: string, home: string) => `cd ${other} && eval "cd ${home}" && `],
      ['a function cd', (other: string, home: string) => `cd ${other} && f() { cd ${home}; }; f; `],
      ['env --chdir', (other: string, home: string) => `cd ${other} && env --chdir=${home} `],
    ])('for gh that can still run in the session checkout after %s', async (_name, prefix) => {
      await withRepo({ origin: 'git@github.com:acme/app.git' }, async home => {
        await withRepo(WIDGETS_REMOTE, other => {
          expect(reasonOf(nonDraftPr('', prefix(other, home)), home)).toContain(DRAFT_FIRST)
        })
      })
    })

    it('for a PR URL selector on the session repository from an other-repository checkout', async () => {
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

    it('without injected or provable session repositories', () => {
      const command = nonDraftPr('--repo widgets-inc/tool')
      expect(reasonOf(command, UNREAD_CWD, {})).toContain(DRAFT_FIRST)
      expect(reasonOf(command, UNREAD_CWD, { sessionRepositories: () => undefined })).toContain(
        DRAFT_FIRST,
      )
      expect(reasonOf(command, UNREAD_CWD, { sessionRepositories: () => new Set() })).toContain(
        DRAFT_FIRST,
      )
    })

    it('for a target among several session repositories', () => {
      const sessionRepositories = () => new Set(['forker/tool', 'Acme/tool'])
      expect(
        reasonOf(nonDraftPr('--repo acme/tool'), UNREAD_CWD, { sessionRepositories }),
      ).toContain(DRAFT_FIRST)
      expect(
        reasonOf(nonDraftPr('--repo forker/tool'), UNREAD_CWD, { sessionRepositories }),
      ).toContain(DRAFT_FIRST)
      const widgets = nonDraftPr('--repo widgets-inc/tool')
      expect(reasonOf(widgets, UNREAD_CWD, { sessionRepositories })).toBeUndefined()
    })
  })

  describe('global rules ignore the repository scope', () => {
    it.each([
      ['gh pr merge', 'gh pr merge 5 --repo acme/platform --squash'],
      ['gh api merge', 'gh api -X PUT repos/acme/platform/pulls/5/merge'],
      ['gh stack', 'gh stack switch --repo acme/platform'],
    ])('%s still blocks for another repository', (_name, command) => {
      expect(reasonOf(command)).toBeDefined()
    })

    it('never reads the session repositories for other gh commands', () => {
      const sessionRepositories = vi.fn<() => ReadonlySet<string> | undefined>(
        () => new Set(['acme/app']),
      )
      findGitHubWorkflowBlock('gh pr merge 5 --repo widgets-inc/tool', UNREAD_CWD, {
        sessionRepositories,
      })
      findGitHubWorkflowBlock('gh pr view 5 --repo widgets-inc/tool', UNREAD_CWD, {
        sessionRepositories,
      })
      expect(sessionRepositories).not.toHaveBeenCalled()
    })
  })

  describe('preToolUseOutput threads the session repositories', () => {
    const payload = { tool_input: { command: nonDraftPr('--repo widgets-inc/tool') } }

    it('allows another repository only when session repositories are injected and exclude it', () => {
      expect(
        preToolUseOutput(payload, { sessionRepositories: () => new Set(['acme/app']) }).exitCode,
      ).toBe(0)
      const home = () => new Set(['acme/app', 'widgets-inc/tool'])
      expect(preToolUseOutput(payload, { sessionRepositories: home }).stderr).toContain(DRAFT_FIRST)
      expect(preToolUseOutput(payload).stderr).toContain(DRAFT_FIRST)
    })
  })
})
