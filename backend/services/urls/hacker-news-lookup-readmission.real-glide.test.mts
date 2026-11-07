import { randomUUID } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import { afterAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { createTestUrlWithHostname, insertHackerNewsReferencesForTest } from '@voucha/test-helpers'
import { insertTestUrlDirect } from '@voucha/test-helpers/entities/urls'
import { ageHackerNewsLookupsForTest } from '@voucha/test-helpers/hacker-news-references'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { hackerNewsQueueConfig } from '@queues/hacker-news/config'
import { hackerNewsQueue } from '@queues/hacker-news/queues'
import { hackerNewsWorkConfig } from './hacker-news-work-limits.mts'
import { readmitHackerNewsLookupPage } from './hacker-news-lookup-readmission.mts'

vi.hoisted(() => {
  const url = new URL(
    process.env.VALKEY_WORKER_QUEUE_URL ?? process.env.VALKEY_URL ?? 'redis://localhost:6379',
  )
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0])
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})

describe('Hacker News refresh readmission', () => {
  beforeEach(async () => {
    await Promise.all([
      hackerNewsQueueConfig.waitForInitialization(),
      hackerNewsWorkConfig.waitForInitialization(),
    ])
    onTestFinished(
      overrideDynamicConfigFieldsForTest(hackerNewsQueueConfig, { lookups_enabled: true }),
    )
    onTestFinished(
      overrideDynamicConfigFieldsForTest(hackerNewsWorkConfig, { lookup_batch_size: 1 }),
    )
  })
  afterAll(async () => {
    await hackerNewsQueue.close()
    vi.unstubAllEnvs()
  })

  it('preserves exact timestamp ties and the frozen sweep window across pages and lost jobs', async () => {
    const now = Date.now()
    const [first, second, third, excluded, missing] = await Promise.all(
      Array.from({ length: 5 }, () => createTestUrlWithHostname()),
    )
    const tied = [first!, second!].toSorted((a, b) => a.localeCompare(b))
    const owned = [...tied, third!]
    onTestFinished(async () => {
      for (const id of owned) await (await hackerNewsQueue.getJob(`hacker-news__${id}`))?.remove()
    })
    await Promise.all(
      [...owned, excluded!].map(url_id =>
        insertHackerNewsReferencesForTest({ url_id, story_count: 0, comment_count: 0 }),
      ),
    )
    const secondPrefix = new Date(now - 2 * 86_400_000).toISOString().slice(0, 19)
    await ageHackerNewsLookupsForTest([...tied, excluded!], `${secondPrefix}.123456Z`)
    await ageHackerNewsLookupsForTest([third!], `${secondPrefix}.123457Z`)
    const options = { urlIds: [...owned, missing!], now }
    const page = await readmitHackerNewsLookupPage(options)
    expect(page.admittedIds).toEqual([tied[0]])
    expect(page.after?.urlId).toBe(tied[0])
    expect(page.after?.lookedUpAt).toContain('.123456')
    expect(page.hasMore).toBe(true)
    const next = await readmitHackerNewsLookupPage({
      ...options,
      after: page.after,
      window: page.window,
      now: now + 200 * 86_400_000,
    })
    expect(next.admittedIds).toEqual([tied[1]])
    expect(next.after?.lookedUpAt).toBe(page.after?.lookedUpAt)
    expect(next.window).toEqual(page.window)
    const last = await readmitHackerNewsLookupPage({
      ...options,
      after: next.after,
      window: next.window,
    })
    expect(last.admittedIds).toEqual([third])
    expect(last.after?.lookedUpAt).toContain('.123457')
    const terminal = await readmitHackerNewsLookupPage({
      ...options,
      after: last.after,
      window: last.window,
    })
    expect(terminal.hasMore).toBe(false)
    expect(terminal.after).toEqual(last.after)
    expect(await hackerNewsQueue.getJob(`hacker-news__${excluded}`)).toBeFalsy()
    expect(await hackerNewsQueue.getJob(`hacker-news__${missing}`)).toBeFalsy()
    await (await hackerNewsQueue.getJob(`hacker-news__${tied[0]}`))?.remove()
    const recovered = await readmitHackerNewsLookupPage({ ...options, now: now + 1000 })
    expect(recovered.admittedIds).toEqual([tied[0]])
    expect((await hackerNewsQueue.getJob(`hacker-news__${tied[0]}`))?.data).toEqual({
      urlId: tied[0],
    })
  })

  it('uses the shortest bounded interval while retaining per-row due and finite-age checks', async () => {
    const now = Date.now()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(hackerNewsWorkConfig, {
        recent_refresh_hours: 24,
        middle_refresh_hours: 48,
        older_refresh_hours: 1,
      }),
    )
    const older = await insertTestUrlDirect(
      null,
      `https://old-${randomUUID()}.example.com/article`,
      { id: uuidv7({ msecs: now - 40 * 86_400_000 }) },
    )
    const expired = await insertTestUrlDirect(
      null,
      `https://expired-${randomUUID()}.example.com/article`,
      { id: uuidv7({ msecs: now - 200 * 86_400_000 }) },
    )
    if (!older || !expired) throw new Error('Expected aged URL fixtures')
    const recent = await createTestUrlWithHostname()
    const fresh = await createTestUrlWithHostname()
    const ids = [older.id, expired.id, recent, fresh]
    onTestFinished(async () => {
      for (const id of ids) await (await hackerNewsQueue.getJob(`hacker-news__${id}`))?.remove()
    })
    await Promise.all(
      ids.map(url_id =>
        insertHackerNewsReferencesForTest({ url_id, story_count: 0, comment_count: 0 }),
      ),
    )
    await ageHackerNewsLookupsForTest([expired.id, recent], new Date(now - 2 * 3_600_000))
    await ageHackerNewsLookupsForTest([older.id], new Date(now - 3_600_000))
    await ageHackerNewsLookupsForTest([fresh], new Date(now - 30 * 60_000))
    const selected = [...[expired.id, recent].toSorted((a, b) => a.localeCompare(b)), older.id]
    const first = await readmitHackerNewsLookupPage({ urlIds: ids, now })
    expect(first.window?.cutoff).toBe(new Date(now - 3_600_000).toISOString())
    const second = await readmitHackerNewsLookupPage({
      urlIds: ids,
      after: first.after,
      window: first.window,
    })
    const third = await readmitHackerNewsLookupPage({
      urlIds: ids,
      after: second.after,
      window: second.window,
    })
    expect([first.after?.urlId, second.after?.urlId, third.after?.urlId]).toEqual(selected)
    expect([...first.admittedIds, ...second.admittedIds, ...third.admittedIds]).toEqual([older.id])
    const end = await readmitHackerNewsLookupPage({
      urlIds: ids,
      after: third.after,
      window: third.window,
    })
    expect(end.hasMore).toBe(false)
    expect(await hackerNewsQueue.getJob(`hacker-news__${fresh}`)).toBeFalsy()
    expect(await hackerNewsQueue.getJob(`hacker-news__${expired.id}`)).toBeFalsy()
    expect(await hackerNewsQueue.getJob(`hacker-news__${recent}`)).toBeFalsy()
  })

  it('does not advance or enqueue while pulling is off and skips rows refreshed above a fixed ceiling', async () => {
    const now = Date.now()
    const ids = await Promise.all(Array.from({ length: 2 }, () => createTestUrlWithHostname()))
    onTestFinished(async () => {
      for (const id of ids) await (await hackerNewsQueue.getJob(`hacker-news__${id}`))?.remove()
    })
    await Promise.all(
      ids.map(url_id =>
        insertHackerNewsReferencesForTest({ url_id, story_count: 0, comment_count: 0 }),
      ),
    )
    await ageHackerNewsLookupsForTest(ids, new Date(now - 2 * 86_400_000))
    const restoreOff = overrideDynamicConfigFieldsForTest(hackerNewsQueueConfig, {
      lookups_enabled: false,
    })
    try {
      const paused = await readmitHackerNewsLookupPage({ urlIds: ids, now })
      expect(paused.after).toBeUndefined()
      expect(paused.hasMore).toBe(false)
      expect(paused.admittedIds).toEqual([])
    } finally {
      restoreOff()
    }
    const first = await readmitHackerNewsLookupPage({ urlIds: ids, now })
    const remaining = ids.find(id => id !== first.after?.urlId)!
    await ageHackerNewsLookupsForTest([remaining], new Date(now))
    const next = await readmitHackerNewsLookupPage({
      urlIds: ids,
      after: first.after,
      window: first.window,
    })
    expect(next.hasMore).toBe(false)
    expect(next.after).toEqual(first.after)
    expect(await hackerNewsQueue.getJob(`hacker-news__${remaining}`)).toBeFalsy()
  })
})
