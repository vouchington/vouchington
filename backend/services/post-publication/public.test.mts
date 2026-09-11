import {
  beginTransaction,
  createTestPost,
  createTestTopic,
  createTestUser,
  expireTestPostPublicationDirtyWorkLease,
  getTestPostPublicationDirtyWork,
  getTestPostPublicationDirtyWorkForScope,
  insertTestCommunity,
  listTestPostPublicationImpactPostIds,
  listTestPostPublicationImpactCommunityIds,
  listTestPostPublicationImpactTopicIds,
  updateTestPostTitleInTransaction,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import type { TransactionQuery } from '@data-stores/psql/types'
import { readFileSync } from 'node:fs'
import { POST_PUBLICATION_DIRTY_WORK_KEY_KINDS } from './capture-keys.mts'
import { lockPostPublicationPostScopes } from './capture-posts.mts'
import {
  acknowledgePostPublicationDirtyWork,
  claimPostPublicationDirtyWork,
  recordPostPublicationChange,
  releasePostPublicationDirtyWorkLease,
  renewPostPublicationDirtyWorkLease,
  updatePostPublicationDirtyWorkCursors,
  type PostPublicationChange,
} from './public.mts'
import { POST_PUBLICATION_REASONS } from './types.mts'

const captureMigrationSql = readFileSync(
  new URL(
    '../../data-stores/psql/migrations/0607-00-00-post-publication-capture.sql',
    import.meta.url,
  ),
  'utf8',
)
const topicAliasKeyMigrationSql = readFileSync(
  new URL(
    '../../data-stores/psql/migrations/0607-00-03-post-publication-topic-alias-keys.sql',
    import.meta.url,
  ),
  'utf8',
)

async function record(change: PostPublicationChange) {
  await using query = await beginTransaction()
  const result = await recordPostPublicationChange(query, change)
  await query.commit()
  return result
}

describe('post publication capture', () => {
  it('acquires a deduplicated set of post locks in global UUID order', async () => {
    const first = crypto.randomUUID()
    const second = crypto.randomUUID()
    const expected = [first, second].toSorted()
    const batches: unknown[][] = []
    const query = (async (_statement: string, values: unknown[]) => {
      batches.push(values)
      return { rows: [], rowCount: 0 }
    }) as unknown as TransactionQuery

    await lockPostPublicationPostScopes(query, [second, first, second])

    expect(batches).toEqual([[expected]])
  })

  it('rejects stale leases while allowing lease renewal and release', async () => {
    const post = await createTestPost()
    const work = await record({ scope: { type: 'post', postId: post.id }, reason: 'post_created' })
    const firstClaim = await claimPostPublicationDirtyWork(work, 60)
    if (!firstClaim) throw new Error('Expected dirty work to be claimed')

    await expireTestPostPublicationDirtyWorkLease(firstClaim.id)
    const staleLease = {
      id: firstClaim.id,
      generation: firstClaim.generation,
      leaseToken: firstClaim.lease_token,
    }
    await expect(
      updatePostPublicationDirtyWorkCursors(staleLease, { postId: post.id }),
    ).resolves.toBe(false)
    await expect(acknowledgePostPublicationDirtyWork(staleLease)).resolves.toBe(false)
    await expect(renewPostPublicationDirtyWorkLease(staleLease, 60)).resolves.toBe(false)
    await expect(releasePostPublicationDirtyWorkLease(staleLease)).resolves.toBe(false)

    const secondClaim = await claimPostPublicationDirtyWork(work, 60)
    if (!secondClaim) throw new Error('Expected expired dirty work to be reclaimed')
    const activeLease = {
      id: secondClaim.id,
      generation: secondClaim.generation,
      leaseToken: secondClaim.lease_token,
    }
    await expect(renewPostPublicationDirtyWorkLease(activeLease, 60)).resolves.toBe(true)
    await expect(releasePostPublicationDirtyWorkLease(activeLease)).resolves.toBe(true)
    await expect(claimPostPublicationDirtyWork(work, 60)).resolves.toMatchObject({ id: work.id })
  })

  it('coalesces post-scoped reasons into one current repair request', async () => {
    const post = await createTestPost()

    const first = await record({ scope: { type: 'post', postId: post.id }, reason: 'post_created' })
    const second = await record({
      scope: { type: 'post', postId: post.id },
      reason: 'post_clearance_changed',
    })

    expect(first.id).toBe(second.id)
    expect(Number(second.generation)).toBe(Number(first.generation) + 1)
    await expect(getTestPostPublicationDirtyWork(second.id)).resolves.toMatchObject({
      post_id: post.id,
      generation: second.generation,
      reasons: ['post_clearance_changed', 'post_created'],
    })
  })

  it('coalesces durable topic-alias scoped work without a post fanout', async () => {
    const aliasId = crypto.randomUUID()
    const first = await record({
      scope: { type: 'topic_alias', topicAliasId: aliasId },
      reason: 'post_topics_changed',
    })
    const second = await record({
      scope: { type: 'topic_alias', topicAliasId: aliasId },
      reason: 'post_topics_changed',
    })

    expect(second.id).toBe(first.id)
    expect(Number(second.generation)).toBe(Number(first.generation) + 1)
    await expect(getTestPostPublicationDirtyWork(second.id)).resolves.toMatchObject({
      topic_alias_id: aliasId,
      post_id: null,
    })
    await expect(claimPostPublicationDirtyWork(second, 60)).resolves.toMatchObject({
      topic_alias_id: aliasId,
    })
  })

  it('retains impacted topic and community keys across a newer generation', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected test user')
    const post = await createTestPost({ user })
    const firstTopic = await createTestTopic({ user })
    const secondTopic = await createTestTopic({ user })
    const firstCommunity = await insertTestCommunity({ createdById: user.id })
    const secondCommunity = await insertTestCommunity({ createdById: user.id })

    const first = await record({
      scope: { type: 'post', postId: post.id },
      reason: 'post_topics_changed',
      impactedPostIds: [post.id],
      impactedTopicIds: [firstTopic.id],
      impactedCommunityIds: [firstCommunity.id],
    })
    const second = await record({
      scope: { type: 'post', postId: post.id },
      reason: 'post_ratings_changed',
      impactedTopicIds: [secondTopic.id, firstTopic.id],
      impactedCommunityIds: [secondCommunity.id],
    })

    expect(second.id).toBe(first.id)
    await expect(listTestPostPublicationImpactPostIds(second.id)).resolves.toEqual([post.id])
    await expect(listTestPostPublicationImpactTopicIds(second.id)).resolves.toEqual(
      [firstTopic.id, secondTopic.id].toSorted(),
    )
    await expect(listTestPostPublicationImpactCommunityIds(second.id)).resolves.toEqual(
      [firstCommunity.id, secondCommunity.id].toSorted(),
    )
  })

  it('retains large tombstone-key sets in bounded batches for one repair generation', async () => {
    const rssFeedId = crypto.randomUUID()
    const impactedPostIds = Array.from({ length: 1_001 }, () => crypto.randomUUID())

    const work = await record({
      scope: { type: 'rss_feed', rssFeedId },
      reason: 'rss_feed_discoverability_changed',
      impactedPostIds,
    })

    await expect(listTestPostPublicationImpactPostIds(work.id)).resolves.toEqual(
      [...impactedPostIds].sort(),
    )
    await expect(getTestPostPublicationDirtyWork(work.id)).resolves.toMatchObject({
      generation: '1',
    })
  })

  it('claims only the exact available generation and fences stale cursors', async () => {
    const post = await createTestPost()
    const first = await record({ scope: { type: 'post', postId: post.id }, reason: 'post_created' })
    const claimed = await claimPostPublicationDirtyWork(first, 60)
    expect(claimed).toMatchObject({ id: first.id, generation: first.generation })

    const current = await record({
      scope: { type: 'post', postId: post.id },
      reason: 'post_updated',
    })
    await expect(
      updatePostPublicationDirtyWorkCursors(
        { id: claimed!.id, generation: claimed!.generation, leaseToken: claimed!.lease_token },
        { postId: post.id },
      ),
    ).resolves.toBe(false)
    await expect(claimPostPublicationDirtyWork(current, 60)).resolves.toMatchObject({
      id: current.id,
      generation: current.generation,
      lease_token: expect.any(String),
    })
  })

  it('acknowledges only the claimed exact generation', async () => {
    const post = await createTestPost()
    const first = await record({ scope: { type: 'post', postId: post.id }, reason: 'post_created' })
    const claimed = await claimPostPublicationDirtyWork(first, 60)
    const current = await record({
      scope: { type: 'post', postId: post.id },
      reason: 'post_updated',
    })

    await expect(
      acknowledgePostPublicationDirtyWork({
        id: claimed!.id,
        generation: claimed!.generation,
        leaseToken: claimed!.lease_token,
      }),
    ).resolves.toBe(false)
    const currentClaim = await claimPostPublicationDirtyWork(current, 60)
    await expect(
      acknowledgePostPublicationDirtyWork({
        id: currentClaim!.id,
        generation: currentClaim!.generation,
        leaseToken: currentClaim!.lease_token,
      }),
    ).resolves.toBe(true)
    await expect(getTestPostPublicationDirtyWork(current.id)).resolves.toBeUndefined()
  })

  it('rejects an unsupported publication reason before recording work', async () => {
    await expect(
      recordPostPublicationChange(undefined as never, {
        scope: { type: 'post', postId: 'not-used' },
        reason: 'unsupported' as PostPublicationChange['reason'],
      }),
    ).rejects.toThrow('Unsupported post publication reason')
  })

  it('keeps publication reasons and retained-key kinds aligned with database constraints', () => {
    expect(
      extractSqlValues(captureMigrationSql, /reasons <@ ARRAY\[([\s\S]*?)\]::TEXT\[\]/u),
    ).toEqual([...POST_PUBLICATION_REASONS].toSorted())
    expect(
      extractSqlValues(
        topicAliasKeyMigrationSql,
        /post_publication_dirty_work_keys_kind_check CHECK \(kind IN \(([\s\S]*?)\)\) NOT VALID/u,
      ),
    ).toEqual([...POST_PUBLICATION_DIRTY_WORK_KEY_KINDS].toSorted())
  })

  it('rejects a topic-alias scope without an alias identifier', async () => {
    await expect(
      recordPostPublicationChange(undefined as never, {
        scope: { type: 'topic_alias', topicAliasId: '' },
        reason: 'post_topics_changed',
      }),
    ).rejects.toThrow('Post publication scope requires an identifier')
  })

  it('rolls back a source mutation and its capture together', async () => {
    const post = await createTestPost()
    await expect(rollbackCapturedTitleMutation(post.id)).rejects.toThrow('force rollback')
    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id }),
    ).resolves.toBeUndefined()
  })
})

async function rollbackCapturedTitleMutation(postId: string): Promise<void> {
  await using query = await beginTransaction()
  await updateTestPostTitleInTransaction(query, postId, 'rolled-back publication capture')
  await recordPostPublicationChange(query, {
    scope: { type: 'post', postId },
    reason: 'post_updated',
  })
  throw new Error('force rollback')
}

function extractSqlValues(sql: string, constraint: RegExp): string[] {
  const values = constraint.exec(sql)?.[1]
  if (!values) throw new Error(`Expected migration constraint matching ${constraint}`)
  return [...values.matchAll(/'([^']+)'/gu)].map(match => match[1]!).toSorted()
}
