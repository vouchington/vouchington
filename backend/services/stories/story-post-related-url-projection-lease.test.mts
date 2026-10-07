import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectionWork } from './story-post-related-url-projection-types.mts'
import { runWithStoryPostRelatedUrlProjectionLeaseRenewal } from './story-post-related-url-projection-lease.mts'

type RenewLease = (work: ProjectionWork) => Promise<boolean>

describe('story post related URL projection lease renewal', () => {
  afterEach(() => vi.useRealTimers())

  it('renews the exact lease while URL screening is still running', async () => {
    vi.useFakeTimers()
    const screening = Promise.withResolvers<string>()
    const renew = vi.fn<RenewLease>().mockResolvedValue(true)
    const running = runWithStoryPostRelatedUrlProjectionLeaseRenewal(
      projectionWork(),
      () => screening.promise,
      { renewalMs: 10, renew },
    )

    await vi.advanceTimersByTimeAsync(25)
    expect(renew).toHaveBeenCalledTimes(3)
    screening.resolve('safe')

    await expect(running).resolves.toEqual({ value: 'safe' })
    expect(renew).toHaveBeenCalledTimes(4)
  })

  it('fails closed when a periodic renewal loses ownership', async () => {
    vi.useFakeTimers()
    const screening = Promise.withResolvers<string>()
    const renew = vi.fn<RenewLease>().mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const running = runWithStoryPostRelatedUrlProjectionLeaseRenewal(
      projectionWork(),
      () => screening.promise,
      { renewalMs: 10, renew },
    )

    await vi.advanceTimersByTimeAsync(10)
    screening.resolve('stale')

    await expect(running).resolves.toBeNull()
  })
})

function projectionWork(): ProjectionWork {
  return {
    post_id: crypto.randomUUID(),
    story_id: crypto.randomUUID(),
    generation: '1',
    sweep_upper_bound_source_id: crypto.randomUUID(),
    sweep_upper_bound_relation_id: null,
    relation_snapshot_at: new Date(),
    cursor_source_id: null,
    source_completed_at: null,
    cursor_prune_id: null,
    lease_token: crypto.randomUUID(),
  }
}
