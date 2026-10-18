import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  createTestUrlWithHostname,
  insertTestPost,
  insertTestRssFeedItem,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import { hardDeleteTestPost } from '@voucha/test-helpers/entities/posts-deletion'
import { hardDeleteTestUser } from '@voucha/test-helpers/entities/users'
import {
  hardDeleteReceiptTestHostname,
  hardDeleteReceiptTestRssFeedItem,
} from '@voucha/test-helpers/agent-call-receipt-targets'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import {
  completeAgentCallReceipt,
  getAgentCallReceipt,
  reserveAgentCallReceipt,
  type ReportReceiptTarget,
} from './agent-call-receipts.mts'

const digest = '0'.repeat(64)
function operationKey(): string {
  return createHash('sha256').update(randomUUID()).digest('hex')
}

describe('report call receipt target retention', () => {
  it.each(['post', 'comment', 'user', 'url_hostname', 'rss_feed_item'] as const)(
    'erases completed and in-flight %s results while retaining the paid operation',
    async entityType => {
      const fixture = await createTarget(entityType)
      const completed = operationKey()
      const pending = operationKey()
      for (const key of [completed, pending]) {
        await expect(
          reserveAgentCallReceipt(key, 'report-judgement', digest, undefined, fixture.target),
        ).resolves.toBe(true)
      }
      await completeAgentCallReceipt(completed, 'encrypted-private-report-result')
      await fixture.remove()
      for (const key of [completed, pending]) {
        await expect(getAgentCallReceipt(key)).resolves.toEqual({
          request_sha256: digest,
          result_ciphertext: 'erased',
        })
        await expect(completeAgentCallReceipt(key, 'late-private-result')).rejects.toBeInstanceOf(
          Error,
        )
        await expect(
          reserveAgentCallReceipt(key, 'report-judgement', digest, undefined, fixture.target),
        ).resolves.toBe(false)
        await expect(getAgentCallReceipt(key)).resolves.toEqual({
          request_sha256: digest,
          result_ciphertext: 'erased',
        })
      }
    },
  )

  it('rejects an unknown agent slug before reserving a paid operation', async () => {
    const key = operationKey()
    await expect(
      reserveAgentCallReceipt(key, 'report-judgement-typo', digest),
    ).rejects.toMatchObject({ code: '22P02' })
    await expect(getAgentCallReceipt(key)).resolves.toBeUndefined()
  })

  it('rejects an initial report receipt without a concrete target', async () => {
    await expect(
      reserveAgentCallReceipt(operationKey(), 'report-judgement', digest),
    ).rejects.toMatchObject({ code: 'P0001' })
  })

  it('rejects a reservation for a target that has already been deleted', async () => {
    const fixture = await createTarget('user')
    await fixture.remove()
    const key = operationKey()
    await expect(
      reserveAgentCallReceipt(key, 'report-judgement', digest, undefined, fixture.target),
    ).rejects.toMatchObject({ code: '23503' })
    await expect(getAgentCallReceipt(key)).resolves.toBeUndefined()
  })
})

async function createTarget(entityType: ReportReceiptTarget['entityType']): Promise<{
  target: ReportReceiptTarget
  remove(): Promise<void>
}> {
  if (entityType === 'user') {
    const user = await createTestUserDirect()
    return { target: { entityType, entityId: user.id }, remove: () => hardDeleteTestUser(user.id) }
  }
  if (entityType === 'url_hostname') {
    const id = await insertTestUrlHostname({ hostname: `receipt-${randomUUID()}.example.com` })
    return { target: { entityType, entityId: id }, remove: () => hardDeleteReceiptTestHostname(id) }
  }
  if (entityType === 'rss_feed_item') {
    const feed = await createTestRssFeed({})
    const id = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: await createTestUrlWithHostname(),
      guid: randomUUID(),
      itemData: { title: 'Owned report receipt item' },
      contentSha256: Buffer.alloc(32),
    })
    return {
      target: { entityType, entityId: id },
      remove: () => hardDeleteReceiptTestRssFeedItem(id),
    }
  }
  const user = await createTestUserDirect()
  const post = await insertTestPost({
    title: 'Owned report receipt post',
    slug: `receipt-${randomUUID()}`,
    createdById: user.id,
    markdown: 'Private report context',
  })
  const id =
    entityType === 'comment'
      ? await insertTestPost({
          title: '',
          slug: `receipt-comment-${randomUUID()}`,
          createdById: user.id,
          markdown: 'Private comment context',
          postType: 'comment',
          parentId: post,
          rootId: post,
        })
      : post
  return { target: { entityType, entityId: id }, remove: () => hardDeleteTestPost(id) }
}
