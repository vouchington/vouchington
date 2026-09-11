import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { clearFakeGitEnv, installFakeGit } from 'vouchington-tooling/shared-context'
import { listCandidateFiles } from './file-list.mts'

describe('listCandidateFiles', () => {
  const tempRoot = process.env.RUNNER_TEMP || tmpdir()
  const testDirs: string[] = []
  const originalPath = process.env.PATH

  afterEach(async () => {
    process.env.PATH = originalPath
    clearFakeGitEnv()
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  async function withTrackedFiles(trackedFiles: readonly string[]) {
    const binDir = await mkdtemp(join(tempRoot, 'voucha-fake-git-'))
    testDirs.push(binDir)
    installFakeGit({ binDir, repoRoot: '/repo', trackedFiles, pathPrefix: originalPath })
    return listCandidateFiles('/repo', ['web'])
  }

  it('keeps a plain .tsx source file', async () => {
    const files = await withTrackedFiles(['web/components/comments/comment-permalink.tsx'])

    expect(files).toEqual(['web/components/comments/comment-permalink.tsx'])
  })

  it('drops non-.tsx files', async () => {
    const files = await withTrackedFiles(['web/lib/public-nav.ts', 'web/lib/format.mts'])

    expect(files).toEqual([])
  })

  it('drops files under the Storybook design-system gallery (dev-only, never user-facing)', async () => {
    const files = await withTrackedFiles([
      'web/storybook/design-system/components-showcase-sections.tsx',
      'web/components/real-component.tsx',
    ])

    expect(files).toEqual(['web/components/real-component.tsx'])
  })

  it('drops nav.* files, story/test files, and __tests__ contents', async () => {
    const files = await withTrackedFiles([
      'web/lib/navigation/nav.helpers.tsx',
      'web/components/button.stories.tsx',
      'web/components/button.test.tsx',
      'web/components/button.spec.tsx',
      'web/components/__tests__/button.tsx',
      'web/components/button.tsx',
    ])

    expect(files).toEqual(['web/components/button.tsx'])
  })

  it('reports the git exit code and stderr when file discovery fails', async () => {
    const binDir = await mkdtemp(join(tempRoot, 'voucha-fake-git-'))
    testDirs.push(binDir)
    installFakeGit({
      binDir,
      lsFilesExitCode: 37,
      lsFilesStderr: 'fatal: fixture repository unavailable',
      pathPrefix: originalPath,
      repoRoot: '/repo',
    })

    await expect(listCandidateFiles('/repo', ['web'])).rejects.toThrow(
      'git ls-files failed (exit 37): fatal: fixture repository unavailable',
    )
  })
})
