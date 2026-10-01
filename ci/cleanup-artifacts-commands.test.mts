import { describe, expect, it, vi } from 'vitest'
import { sweepCleanup, type CleanupDeps } from './cleanup-artifacts-commands.mts'
import type { GithubArtifact } from './cleanup-artifacts-github.mts'

const REPO = 'vouchington/vouchington'
const TOKEN = 'test-token'

function artifact(overrides: Partial<GithubArtifact> = {}): GithubArtifact {
  return {
    id: 1,
    name: 'lcov-full-web-shard-1',
    size_in_bytes: 100,
    expired: false,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function fakeDeps(overrides: Partial<CleanupDeps> = {}): CleanupDeps {
  return {
    listRunArtifacts: vi.fn<CleanupDeps['listRunArtifacts']>().mockResolvedValue([]),
    listArtifactsPage: vi.fn<CleanupDeps['listArtifactsPage']>().mockResolvedValue(null),
    getRunConclusion: vi.fn<CleanupDeps['getRunConclusion']>().mockResolvedValue(null),
    deleteArtifact: vi.fn<CleanupDeps['deleteArtifact']>().mockResolvedValue('deleted'),
    ...overrides,
  }
}

describe('sweepCleanup', () => {
  it('pages through artifacts, checks run conclusions, and deletes eligible ones', async () => {
    const oldSuccess = artifact({
      id: 1,
      created_at: '2020-01-01T00:00:00Z',
      workflow_run: { id: 10 },
    })
    const oldFailed = artifact({
      id: 2,
      created_at: '2020-01-01T00:00:00Z',
      workflow_run: { id: 20 },
    })
    const tooNew = artifact({ id: 3, created_at: '2099-01-01T00:00:00Z', workflow_run: { id: 30 } })

    const deps = fakeDeps({
      listArtifactsPage: vi
        .fn<CleanupDeps['listArtifactsPage']>()
        .mockResolvedValueOnce([oldSuccess, oldFailed, tooNew])
        .mockResolvedValueOnce([]),
      getRunConclusion: vi.fn<CleanupDeps['getRunConclusion']>(async (_repo, _token, runId) =>
        runId === 10 ? 'success' : 'failure',
      ),
    })

    const summary = await sweepCleanup(REPO, TOKEN, 6, deps)

    expect(deps.deleteArtifact).toHaveBeenCalledExactlyOnceWith(REPO, TOKEN, 1)
    expect(summary.deletedCount).toBe(1)
  })

  it('stops paging when a page request fails', async () => {
    const deps = fakeDeps({
      listArtifactsPage: vi.fn<CleanupDeps['listArtifactsPage']>().mockResolvedValue(null),
    })

    const summary = await sweepCleanup(REPO, TOKEN, 6, deps)

    expect(deps.listArtifactsPage).toHaveBeenCalledOnce()
    expect(summary).toEqual({ deletedCount: 0, bytesFreed: 0 })
  })
})
