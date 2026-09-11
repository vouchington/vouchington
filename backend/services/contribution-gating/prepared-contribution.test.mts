import { beginTransaction } from '@voucha/test-helpers'
import { describe, expect, it, vi } from 'vitest'

import { executePreparedContribution } from './prepared-contribution.mts'

describe('executePreparedContribution', () => {
  it('returns the prepared response and finalizes only after commit', async () => {
    const finalize = vi.fn<() => Promise<void>>(async () => undefined)

    await using query = await beginTransaction()
    const result = await executePreparedContribution(query, async () => ({
      response: { id: 'committed-response' },
      finalize,
    }))
    expect(finalize).not.toHaveBeenCalled()
    const response = result

    await query.commit()

    expect(response).toEqual({ id: 'committed-response' })
    expect(finalize).toHaveBeenCalledOnce()
  })

  it('drops prepared finalization when the transaction rolls back', async () => {
    const finalize = vi.fn<() => Promise<void>>(async () => undefined)

    async function rejectPreparedContribution(): Promise<void> {
      await using query = await beginTransaction()
      await executePreparedContribution(query, async () => ({ response: null, finalize }))
      throw new Error('rollback prepared contribution')
    }
    await expect(rejectPreparedContribution()).rejects.toThrow('rollback prepared contribution')

    expect(finalize).not.toHaveBeenCalled()
  })

  it('replaces an object response with its post-commit finalization result', async () => {
    await using query = await beginTransaction()
    const result = await executePreparedContribution(query, async () => ({
      response: { id: 'post-id', related_topics: [] as string[] },
      finalize: async () => ({ id: 'post-id', related_topics: ['topic-id'] }),
    }))
    expect(result.related_topics).toEqual([])
    const response = result

    await query.commit()

    expect(response).toEqual({ id: 'post-id', related_topics: ['topic-id'] })
  })
})
