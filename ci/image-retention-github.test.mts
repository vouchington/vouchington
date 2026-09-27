import { describe, expect, it } from 'vitest'

import { GithubPackageClient } from './image-retention-github.mts'
import { mainRepository } from './image-retention-git-test-fixture.mts'
import { retentionBoundary, testImage } from './image-retention-test-fixtures.mts'

const createdAt = '2026-08-01T00:00:00Z'

describe('authenticated GitHub package inventory', () => {
  it('reads every global version page with validated identities and authentication', async () => {
    const { shas, tip } = await mainRepository(1)
    const images = Array.from({ length: 101 }, (_, index) =>
      testImage(index + 1, 'api', shas[0]!, createdAt, { tags: [] }),
    )
    const boundary = await retentionBoundary(images, ['api', 'worker-cpu', 'web'], tip)
    const client = new GithubPackageClient('github-secret', boundary.github)

    expect(await client.listPackages()).toEqual(['api', 'web', 'worker-cpu'])
    expect(await client.listVersions('api')).toHaveLength(101)
    expect(boundary.githubAuthorizations).not.toContain('')
    expect(new Set(boundary.githubAuthorizations)).toEqual(new Set(['Bearer github-secret']))
  })

  it('rejects malformed, duplicate, and noncanonical package version fields', async () => {
    const { shas, tip } = await mainRepository(1)
    const first = testImage(1, 'api', shas[0]!, createdAt)
    const second = testImage(2, 'api', shas[0]!, createdAt)
    second.version.id = first.version.id
    second.version.digest = first.version.digest
    const duplicates = await retentionBoundary([first, second], ['api', 'worker-cpu', 'web'], tip)
    await expect(
      new GithubPackageClient('token', duplicates.github).listVersions('api'),
    ).rejects.toThrow('duplicate package version')

    const malformed = testImage(3, 'api', shas[0]!, createdAt)
    malformed.version.createdAt = '2026-02-31T00:00:00Z'
    const malformedBoundary = await retentionBoundary(
      [malformed],
      ['api', 'worker-cpu', 'web'],
      tip,
    )
    await expect(
      new GithubPackageClient('token', malformedBoundary.github).listVersions('api'),
    ).rejects.toThrow('invalid package version')
  })

  it('fails closed on malformed pagination, short intermediate pages, and API errors', async () => {
    const { shas, tip } = await mainRepository(1)
    const image = testImage(1, 'api', shas[0]!, createdAt)
    const malformed = await retentionBoundary(
      [image],
      ['api', 'worker-cpu', 'web'],
      tip,
      {},
      { versionsLink: 'not-a-link' },
    )
    await expect(
      new GithubPackageClient('token', malformed.github).listVersions('api'),
    ).rejects.toThrow('invalid pagination')

    const short = await retentionBoundary(
      [image],
      ['api', 'worker-cpu', 'web'],
      tip,
      {},
      {
        versionsLink:
          '<https://api.github.com/orgs/vouchington/packages/container/api/versions?per_page=100&page=2>; rel="next"',
      },
    )
    await expect(
      new GithubPackageClient('token', short.github).listVersions('api'),
    ).rejects.toThrow('invalid page boundary')

    const failed = await retentionBoundary([], [], tip, {}, { packageStatus: 401 })
    await expect(new GithubPackageClient('token', failed.github).listPackages()).rejects.toThrow(
      'request failed',
    )
  })

  it('requires the exact authenticated main ref envelope and honors cancellation/body bounds', async () => {
    const { tip } = await mainRepository(1)
    const boundary = await retentionBoundary([], ['api', 'worker-cpu', 'web'], tip)
    const client = new GithubPackageClient('token', boundary.github)
    expect(await client.getRemoteMainTip()).toBe(tip)
    boundary.setRemoteMainResponse({
      object: { sha: tip, type: 'tag' },
      ref: 'refs/heads/not-main',
    })
    await expect(client.getRemoteMainTip()).rejects.toThrow('invalid remote main ref')

    await expect(
      new GithubPackageClient('token', { ...boundary.github, maxBodyBytes: 8 }).listPackages(),
    ).rejects.toThrow('response body exceeds bound')
    const controller = new AbortController()
    controller.abort()
    await expect(
      new GithubPackageClient('token', {
        ...boundary.github,
        signal: controller.signal,
      }).listPackages(),
    ).rejects.toThrow('This operation was aborted')
  })
})
