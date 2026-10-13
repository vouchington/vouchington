import { randomInt } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestPost, createTestUser } from '@voucha/test-helpers'
import { insertTestBloomRepairSources } from '@voucha/test-helpers/entities/bloom-reconciliation'
import {
  streamEntityReconciliationCandidateBatches,
  type EntityReconciliationCandidate,
} from './reconciliation.mts'

describe('Bloom source window continuation', () => {
  it('skips old sources and resumes text/composite keys and slug ties at a one-row cap', async () => {
    const user = await createTestUser()
    const post = await createTestPost({ user })
    const msecs = randomInt(Date.UTC(2001, 0, 1), Date.UTC(2019, 0, 1))
    const fixture = await insertTestBloomRepairSources(user.id, post.id, msecs)
    const window = { start: new Date(msecs), end: new Date(msecs + 1) }
    const candidates: EntityReconciliationCandidate[] = []
    let after: EntityReconciliationCandidate | undefined
    let hasMore = true
    const onComplete = (result: { hasMore: boolean }) => {
      hasMore = result.hasMore
    }
    for (let run = 0; hasMore && run < 20; run += 1) {
      hasMore = false
      for await (const batch of streamEntityReconciliationCandidateBatches(window, {
        after,
        limits: { batchSize: 1, maxRows: 1 },
        onComplete,
      })) {
        expect(batch).toHaveLength(1)
        candidates.push(...batch)
        after = batch.at(-1)
      }
    }
    expect(hasMore).toBe(false)
    expect(candidates.map(row => [row.entityType, row.entityId, row.changeId ?? null])).toEqual(
      expect.arrayContaining([
        ['community', fixture.communityId, null],
        ['api_key', fixture.apiKeyId, null],
        ['topic_alias', fixture.aliasId, null],
        ['url_hostname', fixture.hostnameId, null],
        ['embedding', fixture.embeddingHash, null],
        ...fixture.sourceIds.map(id => ['blocklisted_domain', fixture.domain, id]),
        ['post_slug', post.id, fixture.slug],
        ['post_slug', post.id, `${fixture.slug}-second`],
      ]),
    )
    expect(candidates).toHaveLength(9)
    expect(
      new Set(candidates.map(row => JSON.stringify([row.entityType, row.entityId, row.changeId])))
        .size,
    ).toBe(9)
  })
})
