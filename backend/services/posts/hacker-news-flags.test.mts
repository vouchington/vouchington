import { describe, expect, it } from 'vitest'
import '@services/elections-votes/entity-relation/register-election-vote-handler'
import '@services/urls/register-blocked-hostname-guard'
import '@services/referral-program-link-validations'
import './register-post-related-urls-guard.mts'
import { hackerNewsVisibilityConfig } from '@services/urls/hacker-news-visibility-config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { softDeleteEntityRelation } from '@services/entity-relations/delete'
import { updateEntityRelationElectionVoteStatsFromPrimaryBatch } from '@services/elections-votes/entity-relation/vote-stats-batch'
import { updateEntityRelationElectionVoteStatsFromPrimary } from '@services/elections-votes/entity-relation/vote-stats'
import { createEntityRelationElectionTarget } from '@services/elections-votes/entity-relation/target'
import { createTestPost as createRealPost } from '@voucha/test-helpers/services/posts/test-support'
import {
  beginTransaction,
  createTestPost,
  createTestUrlWithHostname,
  createTestUser,
  insertHackerNewsReferencesForTest,
} from '@voucha/test-helpers'
import { insertTestEntityRelationVote } from '@voucha/test-helpers/entities/entity-relation-votes'
import {
  getPostHackerNewsFlagStateForTest,
  seedTinyPositiveRelatedUrlScoreForTest,
} from '@voucha/test-helpers/hacker-news-flag-state'
import { recomputePostHackerNewsFlags } from './hacker-news-flags.mts'
import { updatePost } from './update.mts'

const relation = getEntityRelationMetadataOrThrow({
  subjectType: 'post',
  predicate: 'related',
  objectType: 'url',
})

async function referencedUrl() {
  const urlId = await createTestUrlWithHostname()
  await insertHackerNewsReferencesForTest({ url_id: urlId, story_count: 1, comment_count: 0 })
  return urlId
}

async function assertFlag(postId: string, value: boolean) {
  return getPostHackerNewsFlagStateForTest(postId).then(state => ({ state, value }))
}

describe('post Hacker News flag upkeep', () => {
  it('sets a newly created post flag in its transaction', async () => {
    const user = await createTestUser()
    const urlId = await referencedUrl()
    const post = await createRealPost({ user, post_type: 'link', url_id: urlId })
    expect(await assertFlag(post.id, true)).toEqual({
      state: { stored: true, expected: true },
      value: true,
    })
  })

  it('recomputes when a post link URL changes', async () => {
    const user = await createTestUser()
    const urlId = await referencedUrl()
    const post = await createRealPost({ user, post_type: 'link', url_id: urlId })
    const other = await createTestUrlWithHostname()
    await updatePost(user, post, { url_id: other })
    expect(await assertFlag(post.id, false)).toEqual({
      state: { stored: false, expected: false },
      value: false,
    })
  })

  it('recomputes on related URL insertion and soft deletion', async () => {
    const user = await createTestUser()
    const post = await createTestPost({ user })
    const urlId = await referencedUrl()
    {
      await using query = await beginTransaction()
      await upsertEntityRelation(user, relation, post, [{ id: urlId }], { query })
      await query.commit()
    }
    expect(await assertFlag(post.id, true)).toEqual({
      state: { stored: true, expected: true },
      value: true,
    })
    await softDeleteEntityRelation(user, relation, post, [{ id: urlId }])
    expect(await assertFlag(post.id, false)).toEqual({
      state: { stored: false, expected: false },
      value: false,
    })
  })

  it('maintains the flag even when relation publication capture is disabled', async () => {
    const user = await createTestUser()
    const post = await createTestPost({ user })
    const urlId = await referencedUrl()
    {
      await using query = await beginTransaction()
      await upsertEntityRelation(user, relation, post, [{ id: urlId }], { query })
      await query.commit()
    }
    expect(await assertFlag(post.id, true)).toEqual({
      state: { stored: true, expected: true },
      value: true,
    })
    await softDeleteEntityRelation(user, relation, post, [{ id: urlId }], {
      capturePublication: false,
    })
    expect(await assertFlag(post.id, false)).toEqual({
      state: { stored: false, expected: false },
      value: false,
    })
  })

  it('recomputes when a related URL vote crosses zero', async () => {
    const user = await createTestUser()
    const post = await createTestPost({ user })
    const urlId = await referencedUrl()
    const [created] = await upsertEntityRelation(user, relation, post, [{ id: urlId }], {
      vote: false,
    })
    if (!created?.id) throw new Error('Expected relation')
    const target = createEntityRelationElectionTarget(created.id, relation.table_name)
    await insertTestEntityRelationVote({
      relationTable: relation.table_name,
      relationId: created.id,
      subjectId: post.id,
      userId: user.id,
      score: 1,
    })
    await updateEntityRelationElectionVoteStatsFromPrimary(target)
    expect(await assertFlag(post.id, true)).toEqual({
      state: { stored: true, expected: true },
      value: true,
    })
    await insertTestEntityRelationVote({
      relationTable: relation.table_name,
      relationId: created.id,
      subjectId: post.id,
      userId: user.id,
      score: 0,
    })
    await updateEntityRelationElectionVoteStatsFromPrimary(target)
    expect(await assertFlag(post.id, false)).toEqual({
      state: { stored: false, expected: false },
      value: false,
    })
  })

  it('rechecks when a positive related URL moves into the top ten', async () => {
    const creator = await createTestUser()
    const voters = await Promise.all([createTestUser(), createTestUser(), createTestUser()])
    const post = await createTestPost({ user: creator })
    const referenced = await referencedUrl()
    const others = await Promise.all(Array.from({ length: 10 }, () => createTestUrlWithHostname()))
    const all = [referenced, ...others]
    const relations = await upsertEntityRelation(
      creator,
      relation,
      post,
      all.map(id => ({ id })),
      { vote: false },
    )
    const ids = new Map(relations.map(row => [row.object_id, row.id]))
    const referencedId = ids.get(referenced)
    if (!referencedId) throw new Error('Expected referenced relation')
    for (const urlId of all) {
      const relationId = ids.get(urlId)
      if (!relationId) throw new Error('Expected related URL relation')
      const voteUsers = urlId === referenced ? voters.slice(0, 1) : voters.slice(0, 2)
      for (const voter of voteUsers) {
        await insertTestEntityRelationVote({
          relationTable: relation.table_name,
          relationId,
          subjectId: post.id,
          userId: voter.id,
          score: 1,
        })
      }
    }
    await updateEntityRelationElectionVoteStatsFromPrimaryBatch(
      relations.map(row => createEntityRelationElectionTarget(row.id!, relation.table_name)),
    )
    expect(await assertFlag(post.id, false)).toEqual({
      state: { stored: false, expected: false },
      value: false,
    })
    for (const voter of voters.slice(1)) {
      await insertTestEntityRelationVote({
        relationTable: relation.table_name,
        relationId: referencedId,
        subjectId: post.id,
        userId: voter.id,
        score: 1,
      })
    }
    await updateEntityRelationElectionVoteStatsFromPrimary(
      createEntityRelationElectionTarget(referencedId, relation.table_name),
    )
    expect(await assertFlag(post.id, true)).toEqual({
      state: { stored: true, expected: true },
      value: true,
    })
  })

  it('maintains flags while visibility is disabled', async () => {
    const user = await createTestUser()
    const urlId = await referencedUrl()
    const post = await createTestPost({ user, post_type: 'link', url_id: urlId })
    await hackerNewsVisibilityConfig.waitForInitialization()
    const restoreVisibility = overrideDynamicConfigFieldsForTest(hackerNewsVisibilityConfig, {
      references_visible: false,
    })
    try {
      await recomputePostHackerNewsFlags([post.id])
      expect(await assertFlag(post.id, true)).toEqual({
        state: { stored: true, expected: true },
        value: true,
      })
    } finally {
      restoreVisibility()
    }
  })

  it('keeps positive net references when Wilson sort rounds to zero', async () => {
    const user = await createTestUser()
    const post = await createTestPost({ user })
    const urlId = await referencedUrl()
    await upsertEntityRelation(user, relation, post, [{ id: urlId }], { vote: false })
    const score = await seedTinyPositiveRelatedUrlScoreForTest(post.id, urlId)
    expect(score?.votes_score_net).toBeGreaterThan(0)
    expect(score?.votes_score_sort).toBe(0)
    await recomputePostHackerNewsFlags([post.id])
    expect(await assertFlag(post.id, true)).toEqual({
      state: { stored: true, expected: true },
      value: true,
    })
  })

  it('recomputes a batch without changing an already accurate flag', async () => {
    const user = await createTestUser()
    const urlId = await referencedUrl()
    const post = await createTestPost({ user, post_type: 'link', url_id: urlId })
    await recomputePostHackerNewsFlags([post.id, post.id])
    expect(await assertFlag(post.id, true)).toEqual({
      state: { stored: true, expected: true },
      value: true,
    })
    await recomputePostHackerNewsFlags([post.id])
    expect(await assertFlag(post.id, true)).toEqual({
      state: { stored: true, expected: true },
      value: true,
    })
  })
})
