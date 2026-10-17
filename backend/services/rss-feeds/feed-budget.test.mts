import { describe, expect, it } from 'vitest'
import { FeedBudgetExceededError, raceFeedBudget } from './feed-budget.mts'
import { resolveProtocolAndClassify } from './resolve-protocol.mts'

describe('raceFeedBudget', () => {
  it('returns the work untouched when the caller set no budget', async () => {
    await expect(raceFeedBudget(undefined, Promise.resolve('done'))).resolves.toBe('done')
  })

  it('settles with the work while the budget holds', async () => {
    await expect(raceFeedBudget(new AbortController().signal, Promise.resolve(1))).resolves.toBe(1)
  })

  it('rejects at once when the budget is already spent', async () => {
    await expect(
      raceFeedBudget(AbortSignal.abort(), new Promise<never>(() => undefined)),
    ).rejects.toBeInstanceOf(FeedBudgetExceededError)
  })

  it('rejects when the signal aborts while the work cannot be interrupted', async () => {
    const controller = new AbortController()
    const raced = raceFeedBudget(controller.signal, new Promise<never>(() => undefined))
    controller.abort()

    await expect(raced).rejects.toBeInstanceOf(FeedBudgetExceededError)
  })

  it('reports an error the work throws after the abort as the budget error', async () => {
    const controller = new AbortController()
    const work = Promise.reject(new Error('socket hang up'))
    controller.abort()

    await expect(raceFeedBudget(controller.signal, work)).rejects.toBeInstanceOf(
      FeedBudgetExceededError,
    )
  })

  it('passes along an error the work throws within the budget', async () => {
    await expect(
      raceFeedBudget(new AbortController().signal, Promise.reject(new Error('unreachable'))),
    ).rejects.toThrow('unreachable')
  })
})

describe('resolveProtocolAndClassify with a budget', () => {
  it('spends no more of a spent budget on the HTTP fallback', async () => {
    const controller = new AbortController()
    const attempted: string[] = []

    await expect(
      resolveProtocolAndClassify('http://example.com/feed.xml', {
        signal: controller.signal,
        fetchAndClassifyFeedImpl: url => {
          attempted.push(url)
          controller.abort()
          return Promise.reject(new Error('aborted'))
        },
      }),
    ).rejects.toThrow('aborted')

    expect(attempted).toEqual(['https://example.com/feed.xml'])
  })

  it('still falls back to HTTP when the HTTPS attempt fails within the budget', async () => {
    const attempted: string[] = []

    const { resolvedUrl } = await resolveProtocolAndClassify('http://example.com/feed.xml', {
      signal: new AbortController().signal,
      fetchAndClassifyFeedImpl: url => {
        attempted.push(url)
        return url.startsWith('https:')
          ? Promise.reject(new Error('no TLS'))
          : Promise.resolve({ kind: 'feed', title: null, feedType: 'article' })
      },
    })

    expect(attempted).toEqual(['https://example.com/feed.xml', 'http://example.com/feed.xml'])
    expect(resolvedUrl).toBe('http://example.com/feed.xml')
  })
})
