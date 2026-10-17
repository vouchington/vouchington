import { describe, expect, it } from 'vitest'
import { bookmarkEntity, unbookmarkEntity } from '@services/bookmarks/upsert'
import { listNotifications } from './list.mts'
import type { CreatedNotification, ReconcileNotificationsResult } from './reconcile-batches.mts'
import { reconcileNotificationsForPost } from './reconcile-post.mts'
import { reconcileNotificationsForRssFeedItem } from './reconcile-rss-feed-item.mts'
import { insertNotificationTestRssFeedItem } from '../../test-helpers/services/notifications/rss-feed-items.mts'
import {
  createRandomString,
  createTestUser,
  insertTestPost,
  insertTestRssFeedDirect,
  setEntityRelationCreatedAt,
  setEntityRelationDeletedAt,
} from '@voucha/test-helpers'

const PAGE_SIZE = 2

type Page = { result: ReconcileNotificationsResult; created: CreatedNotification[] }

/** Walks the continuation chain exactly as the queue does: one job per page. */
async function walkPages(
  reconcilePage: (
    afterUserId: string | undefined,
    onCreated: (created: CreatedNotification[]) => void,
  ) => Promise<ReconcileNotificationsResult>,
): Promise<Page[]> {
  const pages: Page[] = []
  let afterUserId: string | undefined
  do {
    const created: CreatedNotification[] = []
    const result = await reconcilePage(afterUserId, batch => created.push(...batch))
    pages.push({ result, created })
    afterUserId = result.nextAfterUserId
  } while (afterUserId)
  return pages
}

function expectPagesCoverEachUserOnce(pages: Page[], userIds: string[]) {
  const sortedIds = [...userIds].toSorted()
  expect(pages.map(page => page.created.length)).toEqual(
    sortedIds.reduce<number[]>((sizes, _id, index) => {
      if (index % PAGE_SIZE === 0) sizes.push(0)
      sizes[sizes.length - 1]! += 1
      return sizes
    }, []),
  )
  for (const page of pages) expect(page.created.length).toBeLessThanOrEqual(PAGE_SIZE)
  expect(pages.flatMap(page => page.created.map(row => row.user_id)).toSorted()).toEqual(sortedIds)
  // A full page continues after its own last recipient; the short page ends the chain.
  expect(pages.map(page => page.result.nextAfterUserId)).toEqual(
    pages.map((_page, index) =>
      index === pages.length - 1 ? undefined : sortedIds[(index + 1) * PAGE_SIZE - 1],
    ),
  )
}

describe('post notification reconcile pages', () => {
  async function createSubscribedPost(subscriberCount: number) {
    const author = await createTestUser()
    const postCreatedAt = new Date(Date.now() + 2_000)
    const subscribers = await Promise.all(
      Array.from({ length: subscriberCount }, async () => createTestUser()),
    )
    await Promise.all(
      subscribers.map(async subscriber => {
        await bookmarkEntity(subscriber, 'user', { id: author.id }, 'subscribe')
        await setEntityRelationCreatedAt(
          'relation__user__subscribe__user',
          subscriber.id,
          author.id,
          new Date(postCreatedAt.getTime() - 1_000),
        )
      }),
    )
    const random = createRandomString(10)
    const postId = await insertTestPost({
      createdById: author.id,
      title: `Paged recipients ${random}`,
      slug: `notification-paged-recipients-${random}`,
      markdown: `Paged recipients body ${random}`,
      createdAt: postCreatedAt,
    })
    return { author, subscribers, postId, postCreatedAt }
  }

  const reconcilePage =
    (postId: string) =>
    (afterUserId: string | undefined, onCreated: (created: CreatedNotification[]) => void) =>
      reconcileNotificationsForPost(postId, {
        pageSize: PAGE_SIZE,
        batchSize: 1,
        afterUserId,
        onCreatedNotifications: onCreated,
      })

  it('covers every recipient exactly once across pages that never exceed the page size', async () => {
    const { subscribers, postId } = await createSubscribedPost(5)

    const pages = await walkPages(reconcilePage(postId))

    expectPagesCoverEachUserOnce(
      pages,
      subscribers.map(subscriber => subscriber.id),
    )
    expect(pages.reduce((total, page) => total + page.result.created, 0)).toBe(5)
    await Promise.all(
      subscribers.map(async subscriber =>
        expect((await listNotifications(subscriber.id)).results).toHaveLength(1),
      ),
    )
    // Re-walking the chain is idempotent: nothing new is created or pruned.
    const replay = await walkPages(reconcilePage(postId))
    expect(replay.map(page => [page.result.created, page.result.pruned])).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
    ])
  })

  it('prunes a lost recipient inside its own page range and in the final tail', async () => {
    const { author, subscribers, postId, postCreatedAt } = await createSubscribedPost(5)
    await walkPages(reconcilePage(postId))
    const ordered = subscribers.toSorted((a, b) => a.id.localeCompare(b.id))
    const [first, , , , last] = ordered
    for (const lost of [first!, last!]) {
      await unbookmarkEntity(lost, 'user', { id: author.id }, 'subscribe')
      await setEntityRelationDeletedAt(
        'relation__user__subscribe__user',
        lost.id,
        author.id,
        new Date(postCreatedAt.getTime() - 500),
      )
    }

    const pages = await walkPages(reconcilePage(postId))

    expect(pages.map(page => page.result.pruned)).toEqual([1, 1])
    expect((await listNotifications(first!.id)).results).toHaveLength(0)
    expect((await listNotifications(last!.id)).results).toHaveLength(0)
    for (const kept of ordered.slice(1, 4)) {
      expect((await listNotifications(kept.id)).results).toHaveLength(1)
    }
  })
})

describe('RSS feed item notification reconcile pages', () => {
  it('covers every recipient exactly once across pages that never exceed the page size', async () => {
    const feed = await insertTestRssFeedDirect({})
    if (!feed) throw new Error('Failed to create test feed')
    const entityCreatedAt = new Date(Date.now() - 2_000)
    const subscribers = await Promise.all(Array.from({ length: 5 }, async () => createTestUser()))
    await Promise.all(
      subscribers.map(async subscriber => {
        await bookmarkEntity(subscriber, 'rss_feed', { id: feed.id }, 'subscribe')
        await setEntityRelationCreatedAt(
          'relation__user__subscribe__rss_feed',
          subscriber.id,
          feed.id,
          new Date(entityCreatedAt.getTime() - 1_000),
        )
      }),
    )
    const itemId = await insertNotificationTestRssFeedItem(
      feed.id,
      'Paged RSS recipients',
      entityCreatedAt,
    )

    const pages = await walkPages((afterUserId, onCreated) =>
      reconcileNotificationsForRssFeedItem(itemId, {
        pageSize: PAGE_SIZE,
        batchSize: 1,
        afterUserId,
        onCreatedNotifications: onCreated,
      }),
    )

    expectPagesCoverEachUserOnce(
      pages,
      subscribers.map(subscriber => subscriber.id),
    )
    await Promise.all(
      subscribers.map(async subscriber =>
        expect((await listNotifications(subscriber.id)).results).toHaveLength(1),
      ),
    )
  })

  it('rejects a page size that is not a positive integer', async () => {
    const feed = await insertTestRssFeedDirect({})
    const itemId = await insertNotificationTestRssFeedItem(feed!.id, 'Bad page size', new Date())
    await expect(reconcileNotificationsForRssFeedItem(itemId, { pageSize: 0 })).rejects.toThrow(
      'pageSize must be a positive integer',
    )
  })
})
