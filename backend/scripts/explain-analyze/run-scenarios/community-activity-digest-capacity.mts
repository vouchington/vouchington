import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import {
  findCommunityActivityDigestThroughUserId,
  listCommunityActivityDigestRecipientPage,
} from '@services/notifications/community-activity-digest-recipients'
import { getNotificationsWorkLimit } from '@services/notifications/work-limits'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

/** Capture a full recipient page whose last inspected membership is ineligible. */
export async function runCommunityActivityDigestCapacity(): Promise<void> {
  const pageSize = getNotificationsWorkLimit('community_digest_recipient_batch_size')
  assert.equal(pageSize, 250)
  const tag = `digest-capacity-${randomUUID()}`
  const prior = (await findCommunityActivityDigestThroughUserId()) ?? undefined
  let userIds: string[] = []
  let communityIds: string[] = []
  try {
    await using transaction = await beginTransaction()
    const { rows: users } = await transaction<{ id: string }>(
      `/* seedDigestCapacityUsers */
       INSERT INTO users (username)
       SELECT $1 || '-' || position FROM generate_series(1, $2::int) position
       RETURNING id`,
      [tag, pageSize + 1],
    )
    userIds = users.map(user => user.id).toSorted()
    assert.equal(userIds.length, pageSize + 1)
    if (prior) assert.ok(userIds[0]! > prior)
    const { rows: communities } = await transaction<{ id: string; slug: string }>(
      `/* seedDigestCapacityCommunities */
       INSERT INTO communities (name, slug, created_by_id, created_via, archived_at, archived_by_id)
       SELECT $1 || '-' || position, $1 || '-' || position, $2::uuid, 'system',
         CASE WHEN position = 2 THEN CURRENT_TIMESTAMP END,
         CASE WHEN position = 2 THEN $2::uuid END
       FROM generate_series(1, 3) position RETURNING id, slug`,
      [tag, userIds[0]],
    )
    const bySlug = new Map(communities.map(community => [community.slug, community.id]))
    const liveId = bySlug.get(`${tag}-1`)
    const archivedId = bySlug.get(`${tag}-2`)
    const ordinaryId = bySlug.get(`${tag}-3`)
    assert.ok(liveId && archivedId && ordinaryId)
    communityIds = [liveId, archivedId, ordinaryId]
    await transaction(
      `/* seedDigestCapacityMemberships */
       INSERT INTO community_members (community_id, user_id, role)
       SELECT CASE WHEN position = $3 THEN $2::uuid ELSE $1::uuid END, user_id,
         CASE WHEN position % 2 = 0 THEN 'owner'::community_member_roles
           ELSE 'moderator'::community_member_roles END
       FROM unnest($4::uuid[]) WITH ORDINALITY AS input(user_id, position)
       ORDER BY position`,
      [liveId, archivedId, pageSize, userIds],
    )
    await transaction(
      `/* seedDigestCapacityOrdinaryMemberships */
       INSERT INTO community_members (community_id, user_id, role)
       SELECT $1::uuid, user_id, 'member' FROM unnest($2::uuid[]) AS input(user_id)
       ORDER BY user_id`,
      [ordinaryId, userIds],
    )
    await transaction.commit()

    const scenario = 'community-activity-digest-recipient-capacity'
    registerScenarioContract(scenario, {
      expectations: [
        { kind: 'maxProcessedRows', relation: 'community_members', max: 1, captureIndex: 0 },
        {
          kind: 'maxProcessedRows',
          relation: 'community_members',
          max: pageSize + 1,
          captureIndex: 1,
        },
        // The terminal page can inspect four memberships in the generic plan.
        { kind: 'maxProcessedRows', relation: 'community_members', max: 4, captureIndex: 2 },
        { kind: 'maxProcessedRows', relation: 'users', max: pageSize + 1 },
        { kind: 'maxProcessedRows', relation: 'communities', max: pageSize + 1 },
      ],
    })
    await runAndCapture(
      scenario,
      async () => {
        const upper = await findCommunityActivityDigestThroughUserId()
        assert.equal(upper, userIds.at(-1))
        const first = await listCommunityActivityDigestRecipientPage(
          prior,
          upper!,
          undefined,
          pageSize,
        )
        assert.deepEqual(first, {
          page: userIds.slice(0, pageSize - 1).map(user_id => ({ user_id })),
          hasMore: true,
          nextUserId: userIds[pageSize - 1],
          nextCommunityId: archivedId,
        })
        const last = await listCommunityActivityDigestRecipientPage(
          first.nextUserId!,
          upper!,
          undefined,
          pageSize,
          first.nextCommunityId,
        )
        assert.deepEqual(last, {
          page: [{ user_id: userIds[pageSize] }],
          hasMore: false,
          nextUserId: null,
          nextCommunityId: null,
        })
      },
      undefined,
      ['findCommunityActivityDigestThroughUserId', 'listCommunityActivityDigestRecipients'],
      {
        exactCapturedNames: [
          'findCommunityActivityDigestThroughUserId',
          'listCommunityActivityDigestRecipients',
          'listCommunityActivityDigestRecipients',
        ],
      },
    )
  } finally {
    await write(
      '/* cleanupDigestCapacityCommunities */ DELETE FROM communities WHERE id = ANY($1::uuid[])',
      [communityIds],
    )
    await write('/* cleanupDigestCapacityUsers */ DELETE FROM users WHERE id = ANY($1::uuid[])', [
      userIds,
    ])
  }
}
