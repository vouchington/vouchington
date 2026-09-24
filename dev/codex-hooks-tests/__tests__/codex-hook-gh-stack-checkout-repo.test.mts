import { rmSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { stackCheckoutRepo } from '../../codex-hooks/policy/github-stack-checkout-repo.mts'
import { git, withRepo } from '../../test-helpers/stack-checkout-repo.mts'
import { makeTestTempDirSync } from '../test-temp-root.mts'

const ON_GITHUB = ['--hostname', 'github.com']
const ACME = { hostArgs: ON_GITHUB, path: 'repos/acme/widgets' }

// [name, fetch URL, push URL?]
type RemoteSpec = [string, string, string?]

function repoWith(remotes: RemoteSpec[], env: Record<string, string | undefined> = {}) {
  let resolved: ReturnType<typeof stackCheckoutRepo>
  withRepo(({ dir }) => {
    for (const [name, url, pushUrl] of remotes) {
      git(dir, ['remote', 'add', name, url])
      if (pushUrl !== undefined) {
        git(dir, ['remote', 'set-url', '--push', name, pushUrl])
      }
    }
    // `gh repo set-default` state, which gh-stack ignores.
    if (remotes.some(([name]) => name === 'origin')) {
      git(dir, ['config', 'remote.origin.gh-resolved', 'base'])
    }
    resolved = stackCheckoutRepo(dir, env, Date.now() + 10_000)
  })
  return resolved
}

describe('Codex hook gh stack checkout repository', () => {
  describe('from git remotes, like gh-stack', () => {
    it.each([
      ['an https remote', [['origin', 'https://github.com/acme/widgets.git']]],
      ['an scp-style ssh remote', [['origin', 'git@github.com:acme/widgets.git']]],
      ['an ssh URL with a port', [['origin', 'ssh://git@github.com:22/acme/widgets']]],
      ['a git protocol remote', [['origin', 'git://github.com/acme/widgets']]],
      ['an upper-case host', [['origin', 'https://GitHub.com/acme/widgets']]],
      [
        'upstream before origin, ignoring gh repo set-default',
        [
          ['origin', 'https://github.com/fork-owner/widgets'],
          ['upstream', 'https://github.com/acme/widgets'],
        ],
      ],
      [
        'github before origin',
        [
          ['origin', 'https://github.com/fork-owner/widgets'],
          ['github', 'git@github.com:acme/widgets.git'],
        ],
      ],
      [
        'origin over another-host remote of a lower rank',
        [
          ['mirror', 'https://git.example/acme/mirror'],
          ['origin', 'https://github.com/acme/widgets'],
        ],
      ],
      [
        'origin when upstream is a local path, which has no host',
        [
          ['upstream', '/srv/git/widgets'],
          ['origin', 'https://github.com/acme/widgets'],
        ],
      ],
      [
        'the fetch URL over a push URL to another repository',
        [['origin', 'https://github.com/acme/widgets', 'https://github.com/fork-owner/widgets']],
      ],
      [
        'the push URL when the fetch URL has no host',
        [['origin', '/srv/git/widgets', 'https://github.com/acme/widgets']],
      ],
      [
        'unranked remotes that name one repository',
        [
          ['fork', 'https://github.com/acme/widgets'],
          ['mirror', 'git@github.com:ACME/Widgets.git'],
        ],
      ],
    ] as Array<[string, RemoteSpec[]]>)('reads %s', (_label, remotes) => {
      expect(repoWith(remotes)).toEqual(ACME)
    })

    it.each([
      ['no remotes', []],
      [
        'unranked remotes that name different repositories',
        [
          ['fork', 'https://github.com/fork-owner/widgets'],
          ['mirror', 'https://github.com/acme/widgets'],
        ],
      ],
      [
        'an upstream on another host, which gh may know',
        [
          ['upstream', 'https://git.example/acme/widgets'],
          ['origin', 'https://github.com/acme/widgets'],
        ],
      ],
      ['a www. host', [['origin', 'https://www.github.com/acme/widgets']]],
      ['a path that is not owner/repo', [['origin', 'https://github.com/acme/widgets/tree']]],
      ['a percent-escaped path', [['origin', 'https://github.com/acme/wid%67ets']]],
      ['a dot segment', [['origin', 'https://github.com/acme/../acme/widgets']]],
    ] as Array<[string, RemoteSpec[]]>)('fails closed on %s', (_label, remotes) => {
      expect(repoWith(remotes)).toBeUndefined()
    })

    it('fails closed outside a git repository', () => {
      const dir = makeTestTempDirSync('stack-checkout-no-repo-')
      try {
        expect(stackCheckoutRepo(dir, {}, Date.now() + 10_000)).toBeUndefined()
      } finally {
        rmSync(dir, { force: true, recursive: true })
      }
    })

    it('fails closed once the deadline has passed', () => {
      withRepo(({ dir }) => {
        git(dir, ['remote', 'add', 'origin', 'https://github.com/acme/widgets'])
        expect(stackCheckoutRepo(dir, {}, Date.now())).toBeUndefined()
      })
    })
  })

  describe('from GH_REPO, which gh-stack reads before any remote', () => {
    const ORIGIN: RemoteSpec[] = [['origin', 'https://github.com/other-owner/other-repo']]

    it.each([
      ['OWNER/REPO on the default gh host', 'acme/widgets', { ...ACME, hostArgs: [] }],
      ['HOST/OWNER/REPO', 'github.com/acme/widgets', ACME],
      ['an https URL', 'https://github.com/acme/widgets.git', ACME],
      ['an scp-style URL', 'git@github.com:acme/widgets.git', ACME],
    ])('reads %s', (_label, value, expected) => {
      expect(repoWith(ORIGIN, { GH_REPO: value })).toEqual(expected)
    })

    it('falls back to the remotes when GH_REPO is empty, like gh-stack', () => {
      expect(repoWith(ORIGIN, { GH_REPO: '' })?.path).toBe('repos/other-owner/other-repo')
    })

    it.each([
      'ghe.example/acme/widgets',
      'https://ghe.example/acme/widgets',
      'acme',
      'github.com/acme/widgets/extra',
      '/acme/widgets',
      'acme/widgets repo',
    ])('fails closed on GH_REPO=%s', value => {
      expect(repoWith(ORIGIN, { GH_REPO: value })).toBeUndefined()
    })
  })
})
