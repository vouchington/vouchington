import { describe, expect, it, vi } from 'vitest'
import {
  processSweepCopyrightEvidenceRetention,
  type SweepCopyrightEvidenceRetentionDeps as Deps,
} from './copyright-evidence-retention.mts'

function sweepDeps(result: Awaited<ReturnType<Deps['sweep']>>) {
  return {
    sweep: vi.fn<Deps['sweep']>(async () => result),
    recordFailure: vi.fn<Deps['recordFailure']>(context => context.failed.length > 0),
  }
}

describe('processSweepCopyrightEvidenceRetention', () => {
  it('reports a quiet run and still hands the empty result to the failure recorder', async () => {
    const deps = sweepDeps({ erased: 0, ineligible: 0, failed: [] })

    await expect(processSweepCopyrightEvidenceRetention(deps)).resolves.toEqual({
      erased: 0,
      ineligible: 0,
      failed: 0,
    })

    expect(deps.sweep).toHaveBeenCalledOnce()
    expect(deps.recordFailure).toHaveBeenCalledExactlyOnceWith({ erased: 0, failed: [] })
  })

  it('completes with the counts and reports every left-over case instead of failing the job', async () => {
    const failed = [
      { noticeId: 'notice-a', reason: 'Error' },
      { noticeId: 'notice-b', reason: 'DatabaseError:57014' },
    ]
    const deps = sweepDeps({ erased: 3, ineligible: 1, failed })

    await expect(processSweepCopyrightEvidenceRetention(deps)).resolves.toEqual({
      erased: 3,
      ineligible: 1,
      failed: 2,
    })

    expect(deps.recordFailure).toHaveBeenCalledExactlyOnceWith({ erased: 3, failed })
  })

  it('lets a sweep that throws fail the job so the queue retries it', async () => {
    const deps = sweepDeps({ erased: 0, ineligible: 0, failed: [] })
    deps.sweep.mockRejectedValueOnce(new Error('config read failed'))

    await expect(processSweepCopyrightEvidenceRetention(deps)).rejects.toThrow('config read failed')

    expect(deps.recordFailure).not.toHaveBeenCalled()
  })
})
