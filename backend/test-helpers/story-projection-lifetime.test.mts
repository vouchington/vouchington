import { describe, expect, it } from 'vitest'
import { createStoryProjectionLifetime } from './story-projection-lifetime.mts'

describe('owned story projection lifetime', () => {
  it('releases the exact owned claim before draining after a raw callback failure', async () => {
    const primary = new Error('callback')
    const work = { post_id: 'owned', lease_token: 'token' }
    const events: unknown[] = []
    const owner = createStoryProjectionLifetime({
      release: async value => {
        events.push(value)
      },
      drain: async id => {
        events.push(id)
      },
    })
    await expect(
      owner.run(async () => {
        owner.ownPost('owned')
        await owner.withClaim(work, async () => {
          throw primary
        })
      }),
    ).rejects.toBe(primary)
    await owner.finish()
    expect(events).toEqual([work, 'owned'])
  })

  it('retains undefined primary and identical reasons from distinct cleanup operations', async () => {
    const secondary = new Error('shared reason')
    const owner = createStoryProjectionLifetime({
      release: async (_work: { post_id: string }) => {
        throw secondary
      },
      drain: async () => {
        throw secondary
      },
    })
    await expect(
      owner.run(async () => {
        owner.ownPost('owned')
        await owner.withClaim({ post_id: 'owned' }, async () => {
          const rejection = Promise.withResolvers<void>()
          rejection.reject(undefined)
          return rejection.promise
        })
      }),
    ).rejects.toBeUndefined()
    const result = await owner.finish().catch(err => err as AggregateError)
    if (!(result instanceof AggregateError)) throw new Error('Expected cleanup rejection')
    expect(result.cause).toBeUndefined()
    expect(result.errors).toEqual([undefined, secondary, secondary])
    expect(result.errors[1]).toBe(result.errors[2])
  })

  it('does not duplicate a release operation already reported as the primary failure', async () => {
    const primary = new Error('release')
    const secondary = new Error('drain')
    let releases = 0
    const owner = createStoryProjectionLifetime({
      release: async (_work: { post_id: string }) => {
        releases++
        throw primary
      },
      drain: async () => {
        throw secondary
      },
    })
    await expect(
      owner.run(async () => {
        owner.ownPost('owned')
        await owner.withClaim({ post_id: 'owned' }, async () => {})
      }),
    ).rejects.toBe(primary)
    const result = await owner.finish().catch(err => err as AggregateError)
    if (!(result instanceof AggregateError)) throw new Error('Expected cleanup rejection')
    expect(result.cause).toBe(primary)
    expect(result.errors).toEqual([primary, secondary])
    expect(releases).toBe(1)
  })

  it('retains failed owned release operations even when the root catches their rejection', async () => {
    const secondary = new Error('caught release')
    const owner = createStoryProjectionLifetime({
      release: async (_work: { post_id: string }) => {
        throw secondary
      },
      drain: async () => {},
    })
    await owner.run(async () => {
      owner.ownPost('owned')
      await owner.withClaim({ post_id: 'owned' }, async () => {}).catch(() => {})
    })
    const result = await owner.finish().catch(err => err as AggregateError)
    if (!(result instanceof AggregateError)) throw new Error('Expected cleanup rejection')
    expect(result.cause).toBe(secondary)
    expect(result.errors).toEqual([secondary])
  })

  it('refuses unknown foreign claims and never releases or drains their identities', async () => {
    const released: string[] = []
    const drained: string[] = []
    const owner = createStoryProjectionLifetime({
      release: async (work: { post_id: string }) => {
        released.push(work.post_id)
      },
      drain: async id => {
        drained.push(id)
      },
    })
    await expect(
      owner.run(async () => {
        owner.ownPost('fixture')
        await owner.withClaim({ post_id: 'unknown foreign' }, async () => {})
      }),
    ).rejects.toThrow('unregistered projection claim')
    await owner.finish()
    expect(released).toEqual([])
    expect(drained).toEqual(['fixture'])
  })

  it('joins a running root and includes fixture ownership registered while finish waits', async () => {
    const entered = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    const primary = new Error('later callback')
    const drained: string[] = []
    const owner = createStoryProjectionLifetime({
      release: async (_work: { post_id: string }) => {},
      drain: async id => {
        drained.push(id)
      },
    })
    const root = owner.run(async () => {
      owner.ownPost('first')
      entered.resolve()
      await resume.promise
      owner.ownPost('second')
      throw primary
    })
    await entered.promise
    const finish = owner.finish()
    expect(owner.finish()).toBe(finish)
    const observed = root.catch(err => err)
    expect(drained).toEqual([])
    resume.resolve()
    expect(await observed).toBe(primary)
    await finish
    expect(drained).toEqual(['first', 'second'])
  })

  it('drains a committed registered identity when its producer finalization fails', async () => {
    const primary = new Error('finalize')
    const drained: string[] = []
    const owner = createStoryProjectionLifetime({
      release: async (_work: { post_id: string }) => {},
      drain: async id => {
        drained.push(id)
      },
    })
    await expect(
      owner.run(async () => {
        owner.ownPost('committed before finalize')
        throw primary
      }),
    ).rejects.toBe(primary)
    await owner.finish()
    expect(drained).toEqual(['committed before finalize'])
  })

  it('keeps ordered raw drain failures, attempts later owned IDs and repeats the same finish result', async () => {
    const secondary = new Error('second drain')
    const drained: string[] = []
    const owner = createStoryProjectionLifetime({
      release: async (_work: { post_id: string }) => {},
      drain: async id => {
        drained.push(id)
        if (id === 'first') {
          const rejection = Promise.withResolvers<void>()
          rejection.reject(undefined)
          return rejection.promise
        }
        throw secondary
      },
    })
    await owner.run(async () => {
      owner.ownPost('first')
      owner.ownPost('second')
    })
    const finish = owner.finish()
    expect(owner.finish()).toBe(finish)
    const result = await finish.catch(err => err as AggregateError)
    if (!(result instanceof AggregateError)) throw new Error('Expected cleanup rejection')
    expect(result.errors).toEqual([undefined, secondary])
    expect(result.cause).toBeUndefined()
    expect(drained).toEqual(['first', 'second'])
    expect(await owner.finish().catch(err => err)).toBe(result)
    expect(drained).toEqual(['first', 'second'])
  })
})
