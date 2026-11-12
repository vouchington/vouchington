import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { insertTestUrl, insertTestUrlDirect } from '@voucha/test-helpers/entities/urls'
import { getTestUrlRanking } from '@voucha/test-helpers/entities/url-ranking'
import {
  createTestUrlRankingItemIdentity,
  deleteTestUrlRankingItems,
  insertTestUrlRankingItems,
  updateTestUrlRankingItems,
  upsertTestUrlRankingItems,
} from '@voucha/test-helpers/entities/url-ranking-batches'

describe('bulk URL publication ranking', () => {
  it('maintains each URL maximum across multi-item insert, move/date edit, and delete statements', async () => {
    const hostname = `url-ranking-batch-${randomUUID()}.example.com`
    const source = await insertTestUrlDirect(null, `https://${hostname}/source`)
    if (!source) throw new Error('Failed to create ranking URL')
    const targetId = await insertTestUrl({
      url: `https://${hostname}/target`,
      hostnameId: source.hostname.id,
    })
    const ids = await insertTestUrlRankingItems(source.hostname.id, [
      { urlId: source.id, isoDate: '2022-01-01T00:00:00Z' },
      { urlId: source.id, isoDate: '2024-01-01T00:00:00Z' },
      { urlId: targetId, isoDate: '2023-01-01T00:00:00Z' },
    ])
    expect((await getTestUrlRanking(source.id)).latestPublishedAt).toEqual(
      new Date('2024-01-01T00:00:00Z'),
    )
    expect((await getTestUrlRanking(targetId)).latestPublishedAt).toEqual(
      new Date('2023-01-01T00:00:00Z'),
    )

    await updateTestUrlRankingItems([
      { id: ids[0]!, urlId: source.id, isoDate: '2021-01-01T00:00:00Z' },
      { id: ids[1]!, urlId: targetId, isoDate: '2020-01-01T00:00:00Z' },
      { id: ids[2]!, urlId: targetId, isoDate: '2022-01-01T00:00:00Z' },
    ])
    expect((await getTestUrlRanking(source.id)).latestPublishedAt).toEqual(
      new Date('2021-01-01T00:00:00Z'),
    )
    expect((await getTestUrlRanking(targetId)).latestPublishedAt).toEqual(
      new Date('2022-01-01T00:00:00Z'),
    )

    const newId = await createTestUrlRankingItemIdentity(source.hostname.id)
    await upsertTestUrlRankingItems([
      { id: ids[0]!, urlId: targetId, isoDate: '2025-01-01T00:00:00Z' },
      { id: ids[1]!, urlId: source.id, isoDate: '2023-01-01T00:00:00Z' },
      { id: newId, urlId: source.id, isoDate: '2026-01-01T00:00:00Z' },
    ])
    expect((await getTestUrlRanking(source.id)).latestPublishedAt).toEqual(
      new Date('2026-01-01T00:00:00Z'),
    )
    expect((await getTestUrlRanking(targetId)).latestPublishedAt).toEqual(
      new Date('2025-01-01T00:00:00Z'),
    )

    await deleteTestUrlRankingItems([...ids, newId])
    expect((await getTestUrlRanking(source.id)).latestPublishedAt).toBeNull()
    expect((await getTestUrlRanking(targetId)).latestPublishedAt).toBeNull()
  })
})
