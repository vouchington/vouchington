import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupFixtureRepos, makeFixtureRepo } from './check-index-renames.fixture-helpers.mts'
import { createIndexRenameGit } from './index-rename-git.mts'

// Exercises createIndexRenameGit() directly against real mkdtemp repositories — the distinction
// showFile() and assertNotShallow() draw between "this specific git failure" and "some other git
// error" cannot be exercised through the fakeGit() double in check-index-renames.test.mts.
describe('createIndexRenameGit', () => {
  afterAll(() => cleanupFixtureRepos())

  describe('showFile', () => {
    it('returns file contents when the path exists at that revision', async () => {
      const { root, commitFiles } = await makeFixtureRepo()
      await commitFiles({ 'present.txt': 'hi' }, 'base')

      await expect(createIndexRenameGit(root).showFile('HEAD', 'present.txt')).resolves.toBe('hi')
    })

    it('returns null when the path genuinely does not exist at that revision', async () => {
      const { root, commitFiles } = await makeFixtureRepo()
      await commitFiles({ 'present.txt': 'hi' }, 'base')

      await expect(createIndexRenameGit(root).showFile('HEAD', 'missing.txt')).resolves.toBeNull()
    })

    it('rethrows a git failure that is not a missing-path error, instead of reporting null', async () => {
      const { root, commitFiles } = await makeFixtureRepo()
      await commitFiles({ 'present.txt': 'hi' }, 'base')

      await expect(
        createIndexRenameGit(root).showFile('not-a-real-revision', 'present.txt'),
      ).rejects.toThrow(/invalid object name/i)
    })
  })

  describe('assertNotShallow', () => {
    it('wraps a git failure with the fetch-depth diagnostic instead of an opaque git error', async () => {
      const root = await mkdtemp(join(tmpdir(), 'index-rename-git-not-a-repo-'))
      try {
        await expect(createIndexRenameGit(root).assertNotShallow()).rejects.toThrow(
          /could not determine whether the repository is a shallow clone/,
        )
      } finally {
        await rm(root, { force: true, recursive: true })
      }
    })
  })
})
