import { describe, expect, it } from 'vitest'
import { beginTransaction, write } from '@data-stores/psql'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { insertTestReview, insertTestTopic } from '@voucha/test-helpers/entities/topics'
import { observeTestPostgresClientQueries } from '@voucha/test-helpers/postgres-query-pool-observer'
import {
  runTestLandingPageReplacementRace,
  getTestLandingPageGroupMemberCount,
} from '@voucha/test-helpers/landing-page-replacement-race'
import { buildLandingPageInsertRows } from './replace-item-rows.mts'
import { replaceLandingPageItemRows } from './replace-item-writes.mts'
import { createMyLandingPage } from './create.mts'
import { replaceMyLandingPageItems } from './replace-items.mts'
import { getMyLandingPage } from './get.mts'

describe('landing page atomic item replacement', () => {
  it('keeps overlapping replacements on an empty page as complete request sets', async () => {
    const user = await createTestUserDirect()
    const page = await createMyLandingPage(user.id, { title: 'Overlap', slug: 'overlap' })
    const reviews = await Promise.all(
      Array.from({ length: 3 }, () => insertTestReview({ userId: user.id, topicRatings: [] })),
    )
    const firstItems = reviews
      .slice(0, 2)
      .map(id => ({ type: 'review' as const, review_post_id: id }))
    const secondItems = reviews
      .slice(2)
      .map(id => ({ type: 'review' as const, review_post_id: id }))
    const barrier = Promise.withResolvers<void>()
    let arrivals = 0
    const { result } = await observeTestPostgresClientQueries(
      () =>
        Promise.all(
          [
            replaceMyLandingPageItems(user.id, page.id, firstItems, page),
            replaceMyLandingPageItems(user.id, page.id, secondItems, page),
          ].map(operation =>
            operation.catch((err: unknown) => {
              barrier.resolve()
              throw err
            }),
          ),
        ),
      async query => {
        if (query.text.includes('/* getLandingPageRowForUser */')) {
          arrivals += 1
          if (arrivals === 2) barrier.resolve()
          await barrier.promise
        }
      },
    )
    expect(arrivals).toBe(2)
    expect(result.map(value => value.items.length)).toEqual([2, 1])
    const final = await getMyLandingPage(user.id, page.id)
    const ids = final.items.map(item => (item.type === 'review' ? item.review.id : undefined))
    expect([reviews.slice(0, 2), reviews.slice(2)]).toContainEqual(ids)
  })

  it('waits for an actual conflicting position write and replaces the complete set', async () => {
    const user = await createTestUserDirect()
    const page = await createMyLandingPage(user.id, { title: 'Position writes', slug: 'positions' })
    const reviews = await Promise.all(
      Array.from({ length: 3 }, () => insertTestReview({ userId: user.id, topicRatings: [] })),
    )
    const result = await runTestLandingPageReplacementRace({
      writeHeld: query => {
        const rows = buildLandingPageInsertRows(
          [{ type: 'review', review_post_id: reviews[0]! }],
          new Map(),
        )
        return replaceLandingPageItemRows(query, page.id, rows.itemRows, rows.groupMemberRows)
      },
      queryMarker: 'replaceMyLandingPageItems:upsertItems',
      start: () =>
        replaceMyLandingPageItems(
          user.id,
          page.id,
          reviews.slice(1).map(id => ({ type: 'review', review_post_id: id })),
        ),
    })
    expect(result.items.map(item => (item.type === 'review' ? item.review.id : undefined))).toEqual(
      reviews.slice(1),
    )
    expect((await getMyLandingPage(user.id, page.id)).items).toEqual(result.items)
  })

  it('clears the complete newly committed tail after waiting on its written items', async () => {
    const user = await createTestUserDirect()
    const page = await createMyLandingPage(user.id, { title: 'Clear tail', slug: 'clear-tail' })
    const reviews = await Promise.all(
      Array.from({ length: 3 }, () => insertTestReview({ userId: user.id, topicRatings: [] })),
    )
    await replaceMyLandingPageItems(user.id, page.id, [
      { type: 'review', review_post_id: reviews[0]! },
    ])
    const result = await runTestLandingPageReplacementRace({
      writeHeld: query => {
        const rows = buildLandingPageInsertRows(
          reviews.map(id => ({ type: 'review', review_post_id: id })),
          new Map(),
        )
        return replaceLandingPageItemRows(query, page.id, rows.itemRows, rows.groupMemberRows)
      },
      queryMarker: 'replaceMyLandingPageItems:lockWrittenItems',
      start: () => replaceMyLandingPageItems(user.id, page.id, []),
    })
    expect(result.items).toEqual([])
    expect((await getMyLandingPage(user.id, page.id)).items).toEqual([])
  })

  it('removes old group members when a position changes item type', async () => {
    const user = await createTestUserDirect()
    const page = await createMyLandingPage(user.id, { title: 'Group transition', slug: 'groups' })
    const topicId = await insertTestTopic({
      createdById: user.id,
      name: `Replacement group ${crypto.randomUUID()}`,
      slug: `group-${crypto.randomUUID()}`,
    })
    const review = await insertTestReview({
      userId: user.id,
      topicRatings: [{ topicId, rating: 5 }],
    })
    await replaceMyLandingPageItems(user.id, page.id, [
      {
        type: 'topic_group',
        topic_id: topicId,
        entries: [{ type: 'review', review_post_id: review }],
      },
    ])
    expect(await getTestLandingPageGroupMemberCount(page.id)).toBe(1)
    const replaced = await replaceMyLandingPageItems(user.id, page.id, [
      { type: 'review', review_post_id: review },
    ])
    expect(replaced.items).toMatchObject([{ type: 'review', review: { id: review } }])
    expect(await getTestLandingPageGroupMemberCount(page.id)).toBe(0)
  })

  it('refuses a topic retired after validation instead of writing a stale reference', async () => {
    const user = await createTestUserDirect()
    const page = await createMyLandingPage(user.id, { title: 'Merged topic', slug: 'merged' })
    const sourceId = await insertTestTopic({
      createdById: user.id,
      name: `Landing source ${crypto.randomUUID()}`,
      slug: `landing-source-${crypto.randomUUID()}`,
    })
    await write('/* retireLandingTestTopic */ UPDATE topics SET deleted_at = now() WHERE id = $1', [
      sourceId,
    ])
    const rows = buildLandingPageInsertRows(
      [{ type: 'topic_group', topic_id: sourceId, entries: [] }],
      new Map(),
    )
    await using query = await beginTransaction()
    await expect(
      replaceLandingPageItemRows(query, page.id, rows.itemRows, rows.groupMemberRows),
    ).rejects.toMatchObject({ status: 409 })
    await query.rollback()
    expect((await getMyLandingPage(user.id, page.id)).items).toEqual([])
  })
})
