import assert from 'node:assert/strict'
import { describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import {
  createTestPostVoteCaseVariantId,
  runTestPostVoteWriteConflict,
  runTestEarlierPostVoteWait,
  getTestPostVoteTransitionState,
} from '@voucha/test-helpers/post-vote-concurrency'
import { upsertElectionVotesShared } from '../shared/vote-upsert.mts'
import { POST_ELECTION_CONFIG } from './config.mts'

describe('post vote concurrent state transitions', () => {
  it('deduplicates case variants of one UUID and applies the last ballot', async () => {
    const user = await createTestUserDirect()
    const id = createTestPostVoteCaseVariantId()
    const postId = await insertTestPost({
      id,
      createdById: user.id,
      title: 'Case variant ballot',
      markdown: 'Owned ballot target',
      slug: `case-ballot-${crypto.randomUUID()}`,
    })
    const votes = await upsertElectionVotesShared(POST_ELECTION_CONFIG, user.id, [
      { entityId: postId, score: 1 },
      { entityId: postId.toUpperCase(), score: -1 },
    ])
    expect(votes).toHaveLength(1)
    expect(votes[0]).toMatchObject({ entity_id: postId, score: -1 })
    const stored = await getTestPostVoteTransitionState(user.id, postId)
    expect(stored.events.map(event => event.score)).toEqual([-1])
    expect(stored.state.map(state => state.score)).toEqual([-1])
  })

  it('keeps one event and Like epoch per actual transition through concurrent shared writers', async () => {
    const user = await createTestUserDirect()
    const postId = await insertTestPost({
      createdById: user.id,
      title: 'Concurrent post ballot',
      markdown: 'Owned ballot target',
      slug: `concurrent-ballot-${crypto.randomUUID()}`,
    })
    const initial = await runTestPostVoteWriteConflict(
      query =>
        upsertElectionVotesShared(
          POST_ELECTION_CONFIG,
          user.id,
          [{ entityId: postId, score: 1 }],
          undefined,
          { query },
        ),
      () =>
        upsertElectionVotesShared(POST_ELECTION_CONFIG, user.id, [{ entityId: postId, score: 1 }]),
    )
    expect(initial.first).toHaveLength(1)
    expect(initial.second).toEqual([])
    const first = initial.first[0]
    assert(first)
    const likeId = first.outbound_activitypub_like_activity_id
    expect(likeId).toBe(first.id)
    expect(await getTestPostVoteTransitionState(user.id, postId)).toEqual({
      events: [
        {
          id: first.id,
          score: 1,
          outbound_activitypub_like_activity_id: likeId,
          outbound_activitypub_original_like_activity_id: null,
        },
      ],
      state: [{ id: first.id, score: 1, outbound_activitypub_like_activity_id: likeId }],
    })

    const stronger = await runTestPostVoteWriteConflict(
      query =>
        upsertElectionVotesShared(
          POST_ELECTION_CONFIG,
          user.id,
          [{ entityId: postId, score: 2 }],
          undefined,
          { query },
        ),
      () =>
        upsertElectionVotesShared(POST_ELECTION_CONFIG, user.id, [{ entityId: postId, score: 2 }]),
    )
    expect(stronger.first).toHaveLength(1)
    expect(stronger.second).toEqual([])
    const strength = stronger.first[0]
    assert(strength)
    expect(strength.outbound_activitypub_like_activity_id).toBe(likeId)
    expect(strength.id).not.toBe(first.id)

    const clear = await runTestPostVoteWriteConflict(
      query =>
        upsertElectionVotesShared(
          POST_ELECTION_CONFIG,
          user.id,
          [{ entityId: postId, score: null }],
          undefined,
          { query },
        ),
      () =>
        upsertElectionVotesShared(POST_ELECTION_CONFIG, user.id, [
          { entityId: postId, score: null },
        ]),
    )
    expect(clear.first).toHaveLength(1)
    expect(clear.second).toEqual([])
    const cleared = clear.first[0]
    assert(cleared)
    expect(cleared.previous_outbound_ap_like_activity_id).toBe(likeId)
    expect(cleared.outbound_activitypub_like_activity_id).toBeNull()

    const relike = await runTestPostVoteWriteConflict(
      query =>
        upsertElectionVotesShared(
          POST_ELECTION_CONFIG,
          user.id,
          [{ entityId: postId, score: 1 }],
          undefined,
          { query },
        ),
      () =>
        upsertElectionVotesShared(POST_ELECTION_CONFIG, user.id, [{ entityId: postId, score: 1 }]),
    )
    expect(relike.first).toHaveLength(1)
    expect(relike.second).toEqual([])
    const likedAgain = relike.first[0]
    assert(likedAgain)
    expect(likedAgain.outbound_activitypub_like_activity_id).toBe(likedAgain.id)
    expect(likedAgain.outbound_activitypub_like_activity_id).not.toBe(likeId)
    expect(await getTestPostVoteTransitionState(user.id, postId)).toEqual({
      events: [
        {
          id: first.id,
          score: 1,
          outbound_activitypub_like_activity_id: likeId,
          outbound_activitypub_original_like_activity_id: null,
        },
        {
          id: strength.id,
          score: 2,
          outbound_activitypub_like_activity_id: likeId,
          outbound_activitypub_original_like_activity_id: null,
        },
        {
          id: cleared.id,
          score: null,
          outbound_activitypub_like_activity_id: null,
          outbound_activitypub_original_like_activity_id: likeId,
        },
        {
          id: likedAgain.id,
          score: 1,
          outbound_activitypub_like_activity_id: likedAgain.id,
          outbound_activitypub_original_like_activity_id: null,
        },
      ],
      state: [
        { id: likedAgain.id, score: 1, outbound_activitypub_like_activity_id: likedAgain.id },
      ],
    })
  })

  it('orders an earlier-started opposite vote after the later transaction it actually waited for', async () => {
    const user = await createTestUserDirect()
    const postId = await insertTestPost({
      createdById: user.id,
      title: 'Opposite concurrent ballot',
      markdown: 'Owned opposite vote',
      slug: `opposite-ballot-${crypto.randomUUID()}`,
    })
    const result = await runTestEarlierPostVoteWait(
      query =>
        upsertElectionVotesShared(
          POST_ELECTION_CONFIG,
          user.id,
          [{ entityId: postId, score: 1 }],
          undefined,
          { query },
        ),
      query =>
        upsertElectionVotesShared(
          POST_ELECTION_CONFIG,
          user.id,
          [{ entityId: postId, score: -1 }],
          undefined,
          { query },
        ),
    )
    const positive = result.later[0]
    const negative = result.earlier[0]
    assert(positive && negative)
    expect(negative.id.localeCompare(positive.id)).toBeGreaterThan(0)
    expect(negative.previous_outbound_ap_like_activity_id).toBe(
      positive.outbound_activitypub_like_activity_id,
    )
    expect(await getTestPostVoteTransitionState(user.id, postId)).toEqual({
      events: [
        {
          id: positive.id,
          score: 1,
          outbound_activitypub_like_activity_id: positive.id,
          outbound_activitypub_original_like_activity_id: null,
        },
        {
          id: negative.id,
          score: -1,
          outbound_activitypub_like_activity_id: null,
          outbound_activitypub_original_like_activity_id: positive.id,
        },
      ],
      state: [{ id: negative.id, score: -1, outbound_activitypub_like_activity_id: null }],
    })
  })
})
