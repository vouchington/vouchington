import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  checkoutOwner,
  checkoutOwners,
  sessionHomeOwners,
} from '../../codex-hooks/policy/github-checkout-owners.mts'
import { findGitHubWorkflowBlock } from '../../codex-hooks/policy-helpers.mts'
import { git, withRepo } from '../git-remote-repo.mts'
import { withTestTempDir } from '../test-temp-root.mts'

// Synthetic owners: `forker` forks `acme`'s repository; `widgets-inc` is an unrelated owner.
const FORK_REMOTE = { origin: 'git@github.com:forker/tool.git' }
const UPSTREAM_URL = 'git+https://github.com/acme/tool.git'
const DRAFT_FIRST = 'New PRs must be opened as draft first'

const nonDraftPr = (repo: string) => `gh pr create --repo ${repo} --title t --body "no refs"`

function writeManifest(dir: string, manifest: unknown): void {
  const text = typeof manifest === 'string' ? manifest : JSON.stringify(manifest)
  writeFileSync(join(dir, 'package.json'), text)
}

describe('github checkout owners', () => {
  beforeEach(() => {
    // A developer's own gitconfig (url.insteadOf rewrites) must not leak into remote URLs.
    vi.stubEnv('GIT_CONFIG_GLOBAL', '/dev/null')
    vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1')
    vi.stubEnv('GH_REPO', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
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
      await withRepo({ origin: 'git@github.com:widgets-inc/tool.git' }, dir => {
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
      ['two owners', { ...FORK_REMOTE, upstream: 'https://github.com/acme/tool.git' }],
    ])('is undefined for %s', async (_name, remotes) => {
      await withRepo(remotes, dir => expect(checkoutOwner(dir)).toBeUndefined())
    })
  })

  describe('checkoutOwners', () => {
    it('collects remote and set-default owners, skipping hostless remotes and `base`', async () => {
      const remotes = {
        ...FORK_REMOTE,
        upstream: 'https://github.com/acme/tool.git',
        mirror: '/srv/git/tool.git',
      }
      await withRepo(remotes, dir =>
        expect(checkoutOwners(dir)).toEqual(new Set(['forker', 'acme'])),
      )
      const config = { 'remote.origin.gh-resolved': 'Widgets-Inc/tool' }
      await withRepo(
        remotes,
        dir => expect(checkoutOwners(dir)).toEqual(new Set(['forker', 'acme', 'widgets-inc'])),
        config,
      )
      const base = { 'remote.upstream.gh-resolved': 'base' }
      await withRepo(remotes, dir => expect(checkoutOwners(dir)?.size).toBe(2), base)
    })

    it('reads a partial-clone fetch line, which git suffixes with its filter', async () => {
      const remotes = { ...FORK_REMOTE, upstream: 'https://github.com/acme/tool.git' }
      const partial = { 'remote.upstream.partialclonefilter': 'blob:none' }
      await withRepo(
        remotes,
        dir => expect(checkoutOwners(dir)).toEqual(new Set(['forker', 'acme'])),
        partial,
      )
    })

    it.each([
      ['a hosted remote', { lab: 'https://gitlab.example/group/sub/tool.git' }, {}],
      ['a set-default', {}, { 'remote.origin.gh-resolved': 'not a repo' }],
    ])('is undefined for an unparseable %s', async (_name, extraRemotes, config) => {
      await withRepo(
        { ...FORK_REMOTE, ...extraRemotes },
        dir => expect(checkoutOwners(dir)).toBeUndefined(),
        config,
      )
    })

    it('is empty without remotes and undefined outside a repository', async () => {
      await withRepo({}, dir => expect(checkoutOwners(dir)).toEqual(new Set()))
      await withTestTempDir('voucha-owner-scope-plain-', async dir => {
        expect(checkoutOwners(dir)).toBeUndefined()
      })
    })
  })

  describe('sessionHomeOwners', () => {
    it.each([
      ['a git+https URL', UPSTREAM_URL],
      ['a repository object', { type: 'git', url: 'git+ssh://git@github.com/acme/tool.git' }],
      ['the github: shorthand', 'github:acme/tool'],
    ])('adds the owner declared by %s', async (_name, repository) => {
      await withRepo(FORK_REMOTE, dir => {
        writeManifest(dir, { name: 'tool', repository })
        expect(sessionHomeOwners(dir)).toEqual(new Set(['forker', 'acme']))
      })
    })

    it('is the checkout owners without a package.json or a repository field', async () => {
      await withRepo(FORK_REMOTE, dir => {
        expect(sessionHomeOwners(dir)).toEqual(new Set(['forker']))
        writeManifest(dir, { name: 'tool' })
        expect(sessionHomeOwners(dir)).toEqual(new Set(['forker']))
      })
    })

    it('counts a declared repository in a checkout without remotes', async () => {
      await withRepo({}, dir => {
        expect(sessionHomeOwners(dir)).toBeUndefined()
        writeManifest(dir, { repository: UPSTREAM_URL })
        expect(sessionHomeOwners(dir)).toEqual(new Set(['acme']))
      })
    })

    it.each([
      ['the bare owner/repo shorthand', { repository: 'acme/tool' }],
      ['a subgroup URL', { repository: 'https://gitlab.example/group/sub/tool.git' }],
      ['a hostless URL', { repository: 'file:///srv/git/tool.git' }],
      ['a non-string url', { repository: { url: 42 } }],
      ['a null repository', { repository: null }],
      ['malformed JSON', '{"repository": '],
    ])('is undefined for %s', async (_name, manifest) => {
      await withRepo(FORK_REMOTE, dir => {
        writeManifest(dir, manifest)
        expect(sessionHomeOwners(dir)).toBeUndefined()
      })
    })

    it('is undefined for an unreadable package.json or checkout', async () => {
      await withRepo(FORK_REMOTE, dir => {
        mkdirSync(join(dir, 'package.json'))
        expect(sessionHomeOwners(dir)).toBeUndefined()
      })
      await withTestTempDir('voucha-owner-scope-plain-', async dir => {
        writeManifest(dir, { repository: UPSTREAM_URL })
        expect(sessionHomeOwners(dir)).toBeUndefined()
      })
    })

    it('keeps the content rules for a fork-only checkout targeting its upstream', async () => {
      await withRepo(FORK_REMOTE, dir => {
        writeManifest(dir, { repository: UPSTREAM_URL })
        const options = { sessionOwners: () => sessionHomeOwners(dir) }
        const reasonOf = (command: string) => findGitHubWorkflowBlock(command, dir, options)?.reason
        expect(reasonOf(nonDraftPr('acme/tool'))).toContain(DRAFT_FIRST)
        expect(reasonOf(nonDraftPr('forker/tool'))).toContain(DRAFT_FIRST)
        expect(reasonOf(nonDraftPr('widgets-inc/tool'))).toBeUndefined()
      })
    })
  })
})
