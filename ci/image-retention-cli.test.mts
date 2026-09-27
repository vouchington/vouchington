import { describe, expect, it, onTestFinished, vi } from 'vitest'

import { runImageRetention } from './image-retention-cli.mts'
import { mainRepository } from './image-retention-git-test-fixture.mts'
import { retentionBoundary, testImage } from './image-retention-test-fixtures.mts'

const credentials = {
  GH_TOKEN: 'github-secret',
  GHCR_PASSWORD: 'registry-secret',
  GHCR_USERNAME: 'registry-user',
}
const createdAt = '2026-01-01T00:00:00Z'

describe('image retention CLI', () => {
  it('uses the same complete plan for dry-run and apply without deleting during dry-run', async () => {
    const repository = await mainRepository(31)
    const images = [
      ...repository.shas.map((sha, index) =>
        testImage(
          index + 1,
          'api',
          sha,
          new Date(Date.parse(createdAt) + index * 1000).toISOString(),
        ),
      ),
      testImage(100, 'worker-cpu', repository.tip, createdAt),
      testImage(101, 'web', repository.tip, createdAt),
    ]
    const boundary = await retentionBoundary(images, ['api', 'worker-cpu', 'web'], repository.tip)
    const options = {
      git: { cwd: repository.directory },
      github: boundary.github,
      nowMs: Date.parse('2026-09-27T12:00:00Z'),
      registry: boundary.registry,
      workspaceRoot: repository.directory,
    }
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    onTestFinished(() => log.mockRestore())

    const mutableArgs = ['--dry-run']
    const mutableOptions = {
      ...options,
      git: { ...options.git },
      github: { ...options.github },
      registry: { ...options.registry },
    }
    const dryRun = runImageRetention(mutableArgs, credentials, mutableOptions)
    mutableArgs[0] = '--apply'
    mutableOptions.git.cwd = '/missing'
    mutableOptions.github.fetch = async () => {
      throw new Error('mutated GitHub transport')
    }
    mutableOptions.registry.fetch = async () => {
      throw new Error('mutated registry transport')
    }
    await expect(dryRun).resolves.toBe(0)
    expect(boundary.deleteRequests).toEqual([])

    await expect(runImageRetention(['--apply'], credentials, options)).resolves.toBe(0)
    expect(boundary.deleteRequests).toEqual([1])
  })

  it('sanitizes unexpected provider and transport failures', async () => {
    const secret = 'provider-body-credential-secret'
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    onTestFinished(() => error.mockRestore())

    await expect(
      runImageRetention(['--dry-run'], credentials, {
        github: {
          fetch: async () => {
            throw new Error(secret)
          },
        },
      }),
    ).resolves.toBe(1)
    expect(error).toHaveBeenCalledWith('image retention failed')
    expect(error.mock.calls.flat().join(' ')).not.toContain(secret)
  })
})
