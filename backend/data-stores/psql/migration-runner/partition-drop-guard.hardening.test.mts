import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildMonthlyPartitionName } from '@vouchington/postgres/partitions'
import { createTestPost, createTestUser } from '@voucha/test-helpers'
import { insertTestCommunity } from '@voucha/test-helpers/entities/communities'
import {
  insertTestCommunityReviewChange,
  insertTestPendingCommunityPostReview,
} from '@voucha/test-helpers/entities/community-post-reviews'
import {
  insertTestPostClearanceChange,
  readTestPostClearanceAuthor,
  setTestPostClearanceStatus,
} from '@voucha/test-helpers/entities/post-clearance'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import { insertPreservationHoldInTransactionForTest } from '@voucha/test-helpers/entities/user-legal-preservation-holds'
import { PARTITION_DROP_POLICIES } from '../config-driven/utils/partition-drop-policies.mts'
import { beginTransaction } from '../setup.mts'
import {
  getPartitionDropAgeRefusal,
  getPartitionDropRefusal,
  getPartitionDropStatusRefusals,
} from './partition-drop-guard.mts'

function currentDecisionHistoryChild(
  table: 'post_clearance_changes' | 'community_post_review_changes',
) {
  const now = new Date()
  return {
    table,
    partition: buildMonthlyPartitionName(table, now.getUTCFullYear(), now.getUTCMonth() + 1),
    upperBound: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  }
}

describe('partition decision-history holds', () => {
  it('accepts authorless post and community decisions without treating the actor as the author', async () => {
    const actor = await createTestUser()
    const community = await insertTestCommunity({ createdById: actor.id })
    const postId = await insertTestPost({
      title: 'Authorless system post',
      slug: `authorless-${randomUUID()}`,
      markdown: 'System-authored test post',
      createdById: null,
      communityId: community.id,
      clearanceStatus: 'pending',
    })
    const clearance = await setTestPostClearanceStatus(postId, 'approved', actor.id)
    expect(clearance).not.toBeNull()
    expect(await readTestPostClearanceAuthor(clearance!.id)).toBeNull()
    await insertTestPendingCommunityPostReview({ communityId: community.id, postId })
    expect(
      await insertTestCommunityReviewChange({
        communityId: community.id,
        postId,
        changedById: actor.id,
      }),
    ).toBeNull()

    await using query = await beginTransaction()
    await insertPreservationHoldInTransactionForTest(query, actor.id)
    const referenceDate = new Date('2100-01-01T00:00:00.000Z')
    const candidates = [
      currentDecisionHistoryChild('post_clearance_changes'),
      currentDecisionHistoryChild('community_post_review_changes'),
    ]
    const statuses = await getPartitionDropStatusRefusals(
      query,
      candidates,
      PARTITION_DROP_POLICIES,
      referenceDate,
      2,
    )
    for (const candidate of candidates) {
      expect(statuses.get(candidate.partition)).toBeNull()
      expect(
        await getPartitionDropRefusal(
          query,
          candidate,
          PARTITION_DROP_POLICIES[candidate.table],
          referenceDate,
        ),
      ).toBeNull()
    }
  })

  it('rejects a decision for a missing post', async () => {
    await expect(
      insertTestPostClearanceChange({ postId: randomUUID(), status: 'approved' }),
    ).rejects.toThrow('history post does not exist')
  })

  it('preserves a held post author in preview and the retirement recheck, while allowing an unheld author', async () => {
    const author = await createTestUser()
    const actor = await createTestUser()
    const post = await createTestPost({ user: author })
    await using query = await beginTransaction()
    const monthly = currentDecisionHistoryChild('post_clearance_changes')
    await query(
      `/* partitionDropGuard:fixtureEvent */
       INSERT INTO post_clearance_changes
         (id, post_id, post_author_user_id, change_type, changed_by_id)
       VALUES (uuidv7(), $1::uuid, $2::uuid, 'approve', $2::uuid)`,
      [post.id, actor.id],
    )
    const { rows: histories } = await query<{ post_author_user_id: string; changed_by_id: string }>(
      `/* partitionDropGuard:readFixtureEvent */
       SELECT post_author_user_id, changed_by_id FROM post_clearance_changes
       WHERE post_id = $1::uuid ORDER BY id DESC LIMIT 1`,
      [post.id],
    )
    expect(histories[0]).toEqual({ post_author_user_id: author.id, changed_by_id: actor.id })
    const policy = PARTITION_DROP_POLICIES.post_clearance_changes!
    const referenceDate = new Date('2100-01-01T00:00:00.000Z')
    const preview = () =>
      getPartitionDropStatusRefusals(
        query,
        [monthly!],
        { post_clearance_changes: policy },
        referenceDate,
        1,
      )
    expect((await preview()).get(monthly.partition)).toBeNull()
    expect(await getPartitionDropRefusal(query, monthly, policy, referenceDate)).toBeNull()

    await query(
      `/* partitionDropGuard:fixtureHold */
       INSERT INTO user_legal_preservation_holds
         (account_user_id, placed_by_id, reference_ciphertext)
       VALUES ($1::uuid, $1::uuid, 'synthetic hold')`,
      [actor.id],
    )
    expect((await preview()).get(monthly.partition)).toBeNull()
    expect(await getPartitionDropRefusal(query, monthly, policy, referenceDate)).toBeNull()
    await query(
      `/* partitionDropGuard:fixtureAuthorHold */
       INSERT INTO user_legal_preservation_holds
         (account_user_id, placed_by_id, reference_ciphertext)
       VALUES ($1::uuid, $1::uuid, 'synthetic author hold')`,
      [author.id],
    )
    expect((await preview()).get(monthly.partition)).toBe('legal-hold')
    expect(await getPartitionDropRefusal(query, monthly, policy, referenceDate)).toBe('legal-hold')
  })

  it('captures the true community review post author and preserves their held history', async () => {
    const author = await createTestUser()
    const actor = await createTestUser()
    const community = await insertTestCommunity({ createdById: author.id })
    const post = await createTestPost({ user: author, community_id: community.id })
    await insertTestPendingCommunityPostReview({ communityId: community.id, postId: post.id })
    await using query = await beginTransaction()
    const { rows: histories } = await query<{ post_author_user_id: string; changed_by_id: string }>(
      `/* partitionDropGuard:communityFixtureEvent */
       INSERT INTO community_post_review_changes
         (community_id, post_id, post_author_user_id, changed_by_id, change_type, is_platform_override)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $3::uuid, 'approve', FALSE)
       RETURNING post_author_user_id, changed_by_id`,
      [community.id, post.id, actor.id],
    )
    expect(histories[0]).toEqual({ post_author_user_id: author.id, changed_by_id: actor.id })
    const candidate = currentDecisionHistoryChild('community_post_review_changes')
    const policy = PARTITION_DROP_POLICIES.community_post_review_changes!
    const referenceDate = new Date('2100-01-01T00:00:00.000Z')
    await query(
      `/* partitionDropGuard:communityAuthorHold */
       INSERT INTO user_legal_preservation_holds
         (account_user_id, placed_by_id, reference_ciphertext)
       VALUES ($1::uuid, $1::uuid, 'synthetic community hold')`,
      [author.id],
    )
    const status = await getPartitionDropStatusRefusals(
      query,
      [candidate],
      { community_post_review_changes: policy },
      referenceDate,
      1,
    )
    expect(status.get(candidate.partition)).toBe('legal-hold')
    expect(await getPartitionDropRefusal(query, candidate, policy, referenceDate)).toBe(
      'legal-hold',
    )
  })
})

describe('partition drop guard monthly retention', () => {
  it('retains each complete decision-history month for at least 72 months', () => {
    const policy = { minimumRetentionDays: null, minimumRetentionMonths: 72 }
    const reference = new Date('2026-10-28T00:00:00.000Z')
    expect(
      getPartitionDropAgeRefusal(
        {
          table: 'post_clearance_changes',
          partition: 'post_clearance_changes__p_2020_09',
          upperBound: new Date('2020-10-01T00:00:00.000Z'),
        },
        policy,
        reference,
      ),
    ).toBeNull()
    expect(
      getPartitionDropAgeRefusal(
        {
          table: 'post_clearance_changes',
          partition: 'post_clearance_changes__p_2020_10',
          upperBound: new Date('2020-11-01T00:00:00.000Z'),
        },
        policy,
        reference,
      ),
    ).toBe('inside-retention')
  })

  it('retires topic revision children only after twelve complete calendar months', () => {
    const policy = { minimumRetentionDays: null, minimumRetentionMonths: 12 }
    const referenceDate = new Date('2026-10-28T23:59:59.000Z')
    const previous = {
      table: 'topic_revisions',
      partition: 'topic_revisions__p_2025_09',
      upperBound: new Date('2025-10-01T00:00:00.000Z'),
    }
    const current = {
      ...previous,
      partition: 'topic_revisions__p_2025_10',
      upperBound: new Date('2025-11-01T00:00:00.000Z'),
    }
    expect(getPartitionDropAgeRefusal(previous, policy, referenceDate)).toBeNull()
    expect(getPartitionDropAgeRefusal(current, policy, referenceDate)).toBe('inside-retention')
    expect(
      getPartitionDropAgeRefusal(
        previous,
        { minimumRetentionDays: null, minimumRetentionMonths: Number.MAX_SAFE_INTEGER },
        referenceDate,
      ),
    ).toBe('no-declared-retention')
  })
})
