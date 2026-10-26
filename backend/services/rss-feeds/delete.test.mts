import { read } from '@data-stores/psql'
import {
  createTestTopic,
  createTestUser,
  getRssFeedDeletedAt,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createRssFeed } from './create.mts'
import {
  hardDeleteRssFeedById,
  hardDeleteRssFeedByIdAsCurrentUser,
  softDeleteRssFeedById,
} from './delete.mts'
import { getRssFeedById } from './get.mts'

describe('RSS feed deletion', () => {
  let adminUser: PrivateUser
  let nonAdminUser: PrivateUser
  beforeAll(async () => {
    adminUser = await createTestUser({ administrator: true })
    nonAdminUser = await createTestUser({ administrator: false })
  })

  async function createFeed(label: string) {
    const random = crypto.randomUUID()
    const topic = await createTestTopic({ hostname: `delete-test-${label}-${random}.example.com` })
    return createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://delete-test-${label}-${random}.example.com/feed.xml`,
      topic_id: topic.id,
      title: `Delete Test ${label} ${random}`,
    })
  }

  it('soft deletion sets deleted_at and is idempotent', async () => {
    const feed = await createFeed('soft')
    expect(await softDeleteRssFeedById(feed.id)).toBe(true)
    expect(await getRssFeedDeletedAt(feed.id)).not.toBeNull()
    expect(await softDeleteRssFeedById(feed.id)).toBe(false)
  })

  it('starts an asynchronous hard delete and persists its resumable marker', async () => {
    const feed = await createFeed('hard')
    expect(await hardDeleteRssFeedById(feed.id)).toBe(true)
    expect(await getRssFeedById(feed.id)).not.toBeNull()
    const { rows } = await read<{ hard_delete_requested_at: Date | null }>(
      `/* rssFeedDeleteTest:marker */
      SELECT hard_delete_requested_at FROM rss_feeds WHERE id = $1::uuid`,
      [feed.id],
    )
    expect(rows[0]?.hard_delete_requested_at).toBeInstanceOf(Date)
  })

  it('requires staff authorization before starting hard deletion', async () => {
    const feed = await createFeed('auth')
    await expect(hardDeleteRssFeedByIdAsCurrentUser(nonAdminUser, feed.id)).rejects.toMatchObject({
      status: 403,
    })
    expect(await getRssFeedById(feed.id)).not.toBeNull()
    expect(await hardDeleteRssFeedByIdAsCurrentUser(adminUser, feed.id)).toBe(true)
    expect(await getRssFeedById(feed.id)).not.toBeNull()
  })
})
