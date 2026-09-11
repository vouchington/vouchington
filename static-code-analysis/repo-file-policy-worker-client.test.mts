import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { runRepoFilePolicyInWorker } from './repo-file-policy-worker-client.mts'
import { clearFakeGitEnv, installFakeGit } from 'vouchington-tooling/shared-context'

// Proves the worker never spawns git for itself: the fake git on PATH claims the directory is
// NOT inside a work tree, while workerData asserts the opposite (isInsideGitRepo: true, an empty
// tracked-file list). If the worker ignored workerData and recomputed via its own
// buildSharedContext() call, it would observe the fake git's "not a work tree" answer and return
// the git-repo error below instead of the schema-snapshot error a real, non-git-touching
// buildContextFromTrackedFiles() run produces for an empty tracked-file set.
describe('repo-file-policy-worker-client', () => {
  const tempRoot = process.env.RUNNER_TEMP || tmpdir()
  const testDirs: string[] = []
  const originalPath = process.env.PATH

  afterEach(async () => {
    process.env.PATH = originalPath
    clearFakeGitEnv()
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('uses the parent-supplied tracked-file list instead of spawning git in the worker', async () => {
    const binDir = await mkdtemp(join(tempRoot, 'voucha-fake-git-'))
    testDirs.push(binDir)
    installFakeGit({ binDir, isInsideWorkTree: false, pathPrefix: originalPath })

    const dir = await mkdtemp(join(tempRoot, 'voucha-worker-client-'))
    testDirs.push(dir)

    const result = await runRepoFilePolicyInWorker(dir, true, [])

    // Asserts on the schema-snapshot-missing error (reached only past the isInsideGitRepo check,
    // proving the worker trusted workerData.isInsideGitRepo over the fake git's answer) rather
    // than the "not inside a git repository" error a recomputed-via-git result would produce.
    expect(result.name).toBe('repo-file-policy')
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('generated PostgreSQL schema snapshot must be tracked')
    expect(result.errors[0]).not.toContain('not inside a git repository')
  })
})
