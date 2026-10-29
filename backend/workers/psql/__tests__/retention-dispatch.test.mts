import { describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { DATA_RETENTION_JOB_NAME } from '@queues/psql/config'
import { createPsqlRetentionDispatcher } from '../processors/retention-dispatch.mts'

function job(data: unknown) {
  return { name: DATA_RETENTION_JOB_NAME, data } as unknown as Job
}

describe('PostgreSQL retention dispatcher', () => {
  it('skips daily admission for copyright-only continuation results', async () => {
    const admitPending = vi.fn<() => Promise<void>>()
    const dispatch = createPsqlRetentionDispatcher({
      processRetained: vi.fn<() => Promise<unknown>>(),
      processDefault: async () => ({ copyrightActionAttempts: { hasMore: false } }),
      admitPending,
    })
    await dispatch(job({ continuation: { copyrightFamilies: ['copyrightActionAttempts'] } }))
    expect(admitPending).not.toHaveBeenCalled()
  })

  it('admits pending work from the daily result', async () => {
    const admitPending = vi.fn<() => Promise<void>>()
    const result = { undoneActivityPubLikes: { hasMore: false } }
    const dispatch = createPsqlRetentionDispatcher({
      processRetained: vi.fn<() => Promise<unknown>>(),
      processDefault: async () => result,
      admitPending,
    })
    await dispatch(job({}))
    expect(admitPending).toHaveBeenCalledWith(result)
  })
})
