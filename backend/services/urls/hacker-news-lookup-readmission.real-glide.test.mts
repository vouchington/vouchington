import { v7 as uuidv7 } from 'uuid'
import { afterAll, describe, expect, it, onTestFinished, vi } from 'vitest'
import { createTestUrlWithHostname, insertHackerNewsReferencesForTest } from '@voucha/test-helpers'
import { ageHackerNewsLookupsForTest } from '@voucha/test-helpers/hacker-news-references'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { hackerNewsQueueConfig } from '@queues/hacker-news/config'
import { hackerNewsQueue } from '@queues/hacker-news/queues'
import { hackerNewsWorkConfig } from './hacker-news-work-limits.mts'
import { readmitHackerNewsLookupPage } from './hacker-news-lookup-readmission.mts'
import { enqueueMissingHackerNewsLookups } from './hacker-news-lookup-enqueue.mts'

vi.hoisted(() => {
  const url = new URL(
    process.env.VALKEY_WORKER_QUEUE_URL ?? process.env.VALKEY_URL ?? 'redis://localhost:6379',
  )
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0])
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})

describe('Hacker News refresh readmission', () => {
  afterAll(async () => {
    await hackerNewsQueue.close()
    vi.unstubAllEnvs()
  })

  it('readmits lost due refreshes after pause while preserving owned keyset pages and initial admission rules', async () => {
    await Promise.all([
      hackerNewsQueueConfig.waitForInitialization(),
      hackerNewsWorkConfig.waitForInitialization(),
    ])
    onTestFinished(
      overrideDynamicConfigFieldsForTest(hackerNewsWorkConfig, { lookup_batch_size: 1 }),
    )
    const [first, second, excluded, missing] = await Promise.all(
      Array.from({ length: 4 }, () => createTestUrlWithHostname()),
    )
    const owned = [first!, second!].toSorted((a, b) => a.localeCompare(b))
    await Promise.all(
      [...owned, excluded!].map(url_id =>
        insertHackerNewsReferencesForTest({ url_id, story_count: 0, comment_count: 0 }),
      ),
    )
    await ageHackerNewsLookupsForTest([...owned, excluded!], new Date(Date.now() - 2 * 86_400_000))
    const upperId = uuidv7()
    const options = {
      afterId: '00000000-0000-0000-0000-000000000000',
      upperId,
      urlIds: [...owned, missing!],
    }
    const restoreOff = overrideDynamicConfigFieldsForTest(hackerNewsQueueConfig, {
      lookups_enabled: false,
    })
    try {
      expect(await readmitHackerNewsLookupPage(options)).toEqual({
        afterId: options.afterId,
        hasMore: false,
        admittedIds: [],
      })
      expect(await hackerNewsQueue.getJob(`hacker-news__${owned[0]}`)).toBeFalsy()
    } finally {
      restoreOff()
    }
    const expired = await readmitHackerNewsLookupPage({
      ...options,
      urlIds: [owned[0]!],
      now: Date.now() + 200 * 86_400_000,
    })
    expect(expired.admittedIds).toEqual([])
    const fresh = await createTestUrlWithHostname()
    await insertHackerNewsReferencesForTest({ url_id: fresh, story_count: 0, comment_count: 0 })
    expect(
      (await readmitHackerNewsLookupPage({ ...options, upperId: uuidv7(), urlIds: [fresh] }))
        .admittedIds,
    ).toEqual([])
    const page = await readmitHackerNewsLookupPage(options)
    expect(page).toEqual({ afterId: owned[0], hasMore: true, admittedIds: [owned[0]] })
    const next = await readmitHackerNewsLookupPage({ ...options, afterId: page.afterId })
    expect(next.admittedIds).toEqual([owned[1]])
    expect(await hackerNewsQueue.getJob(`hacker-news__${excluded}`)).toBeFalsy()
    expect(await hackerNewsQueue.getJob(`hacker-news__${missing}`)).toBeFalsy()
    const terminal = await readmitHackerNewsLookupPage({ ...options, afterId: next.afterId })
    expect(terminal.hasMore).toBe(false)
    for (const id of owned) {
      const job = await hackerNewsQueue.getJob(`hacker-news__${id}`)
      expect(job?.data).toEqual({ urlId: id })
      await job?.remove()
    }
    // A removed terminal-failure job leaves its persisted due fact eligible for readmission.
    await enqueueMissingHackerNewsLookups([owned[0]!])
    const recovered = await hackerNewsQueue.getJob(`hacker-news__${owned[0]}`)
    expect(recovered?.data).toEqual({ urlId: owned[0] })
    await recovered?.remove()
  })
})
