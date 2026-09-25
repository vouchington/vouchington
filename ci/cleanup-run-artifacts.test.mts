import { describe, expect, it, vi } from 'vitest'

import { cleanupRunArtifacts } from './cleanup-run-artifacts.mjs'

type Artifact = {
  id: number
  name: string
  expired: boolean
  size_in_bytes: number
}

function artifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 1,
    name: 'coverage-web',
    expired: false,
    size_in_bytes: 100,
    ...overrides,
  }
}

function githubStub(artifacts: Artifact[]) {
  const listWorkflowRunArtifacts = vi.fn<(params: unknown) => Promise<unknown>>()
  const deleteArtifact = vi.fn<(params: unknown) => Promise<void>>().mockResolvedValue(undefined)
  const paginate = vi
    .fn<(method: unknown, params: unknown) => Promise<Artifact[]>>()
    .mockResolvedValue(artifacts)

  return {
    github: {
      paginate,
      rest: { actions: { deleteArtifact, listWorkflowRunArtifacts } },
    },
    deleteArtifact,
    listWorkflowRunArtifacts,
    paginate,
  }
}

describe('cleanupRunArtifacts', () => {
  it('deletes only non-expired artifacts classified for deletion', async () => {
    const stub = githubStub([
      artifact({ id: 1, name: 'coverage-web' }),
      artifact({ id: 2, name: 'next-static-web' }),
      artifact({ id: 3, name: 'unknown-debug-output' }),
      artifact({ id: 4, name: 'vitest-blob-web', expired: true }),
      artifact({ id: 5, name: 'web-build-timings-web' }),
      artifact({ id: 6, name: 'browser-debug-log-storybook' }),
    ])
    const log = {
      info: vi.fn<(message: string) => void>(),
      warning: vi.fn<(message: string) => void>(),
    }

    await expect(
      cleanupRunArtifacts({
        github: stub.github,
        repo: { owner: 'vouchington', repo: 'vouchington' },
        runId: '42',
        log,
      }),
    ).resolves.toEqual({ deletedCount: 2, bytesFreed: 200 })

    expect(stub.paginate).toHaveBeenCalledWith(stub.listWorkflowRunArtifacts, {
      owner: 'vouchington',
      repo: 'vouchington',
      run_id: 42,
      per_page: 100,
    })
    expect(stub.deleteArtifact).toHaveBeenNthCalledWith(1, {
      owner: 'vouchington',
      repo: 'vouchington',
      artifact_id: 1,
    })
    expect(stub.deleteArtifact).toHaveBeenCalledTimes(2)
  })

  it('logs a failed deletion and continues with the remaining artifacts', async () => {
    const stub = githubStub([artifact({ id: 1 }), artifact({ id: 2 })])
    stub.deleteArtifact.mockRejectedValueOnce(new Error('API unavailable'))
    const log = {
      info: vi.fn<(message: string) => void>(),
      warning: vi.fn<(message: string) => void>(),
    }

    await expect(
      cleanupRunArtifacts({
        github: stub.github,
        repo: { owner: 'vouchington', repo: 'vouchington' },
        runId: '42',
        log,
      }),
    ).resolves.toEqual({ deletedCount: 1, bytesFreed: 100 })

    expect(stub.deleteArtifact).toHaveBeenCalledTimes(2)
    expect(log.warning).toHaveBeenCalledWith(expect.stringContaining('API unavailable'))
  })

  it('does not count an artifact that another cleanup already deleted', async () => {
    const stub = githubStub([artifact()])
    stub.deleteArtifact.mockRejectedValueOnce({ status: 404 })
    const log = {
      info: vi.fn<(message: string) => void>(),
      warning: vi.fn<(message: string) => void>(),
    }

    await expect(
      cleanupRunArtifacts({
        github: stub.github,
        repo: { owner: 'vouchington', repo: 'vouchington' },
        runId: '42',
        log,
      }),
    ).resolves.toEqual({ deletedCount: 0, bytesFreed: 0 })

    expect(log.warning).not.toHaveBeenCalled()
  })

  it('rejects a non-numeric run ID before calling GitHub', async () => {
    const stub = githubStub([])

    await expect(
      cleanupRunArtifacts({
        github: stub.github,
        repo: { owner: 'vouchington', repo: 'vouchington' },
        runId: 'not-a-run-id',
        log: {
          info: vi.fn<(message: string) => void>(),
          warning: vi.fn<(message: string) => void>(),
        },
      }),
    ).rejects.toThrow('runId must be a positive integer')
    expect(stub.paginate).not.toHaveBeenCalled()
  })
})
