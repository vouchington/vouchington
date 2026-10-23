import type { TransactionQuery } from '@data-stores/psql'
import { v7 } from 'uuid'
import { recordInboxActivity } from '../services/ap-inbox-activities/record-activity.mts'

export async function recordFederationInboxActivityReplayForTest(
  query: TransactionQuery,
  activityId: string,
): Promise<boolean> {
  return recordInboxActivity(activityId, 'Follow', 'https://retention-test.invalid/actor', {
    query,
  })
}

export type FederationRetentionFixtureIds = {
  expiredInboxActivityIds: string[]
  currentInboxActivityId: string
  expiredDistributionActivityIds: string[]
  unfinishedDistributionActivityId: string
  expiredFollowerDistributionIds: string[]
  activeFollowerDistributionId: string
  currentFollowerDistributionId: string
}
/** Inserts old, current, terminal, and active source rows for retention tests. */
export async function insertFederationRetentionFixturesForTest(input: {
  senderUserId: string
  recipientUserId: string
  postId: string
  now: Date
  query: TransactionQuery
}): Promise<FederationRetentionFixtureIds> {
  const epochId = (sequence: number) => v7({ msecs: 0, seq: sequence })
  const expiredInboxActivityIds = [epochId(1), epochId(2)]
  const currentInboxActivityId = v7({ msecs: input.now.getTime() })
  const expiredDistributionActivityIds = [epochId(3), epochId(4)]
  const unfinishedDistributionActivityId = v7({ msecs: input.now.getTime(), seq: 1 })
  const expiredFollowerDistributionIds = [epochId(5), epochId(6)]
  const activeFollowerDistributionId = v7({ msecs: 0, seq: 7 })
  const currentFollowerDistributionId = v7({ msecs: input.now.getTime(), seq: 2 })
  const expiredDistributionCompletedAtInput = `${new Date(
    input.now.getTime() - 400 * 24 * 60 * 60 * 1_000,
  )
    .toISOString()
    .replace(/\.\d{3}Z$/, '')
    .replace('T', ' ')}.123456+00`
  const oldCompletion = expiredDistributionCompletedAtInput
  for (const [index, id] of expiredInboxActivityIds.entries()) {
    await input.query(
      `/* insertExpiredFederationInboxActivityForTest */
       INSERT INTO activitypub_inbox_activities (id, activity_id, activity_type, actor_uri, received_at)
       VALUES ($1::uuid, $2, CASE WHEN $4 = 0 THEN 'Follow' ELSE 'Create' END, $3, $5)`,
      [
        id,
        `https://retention-test.invalid/activity/${index}/${id}`,
        'https://retention-test.invalid/actor',
        index,
        oldCompletion,
      ],
    )
  }
  await input.query(
    `/* insertCurrentFederationInboxActivityForTest */
     INSERT INTO activitypub_inbox_activities (id, activity_id, activity_type, actor_uri)
     VALUES ($1::uuid, $2, 'Create', $3)`,
    [
      currentInboxActivityId,
      `https://retention-test.invalid/activity/current/${currentInboxActivityId}`,
      'https://retention-test.invalid/actor',
    ],
  )
  for (const activityId of expiredDistributionActivityIds) {
    await input.query(
      `/* insertExpiredFederationDistributionForTest */
       INSERT INTO activitypub_distribution_work_items (activity_id, source_user_id, completed_at)
       VALUES ($1::uuid, $2::uuid, $3::timestamptz)`,
      [activityId, input.senderUserId, oldCompletion],
    )
  }
  await input.query(
    `/* insertUnfinishedFederationDistributionForTest */
     INSERT INTO activitypub_distribution_work_items (activity_id, source_user_id)
     VALUES ($1::uuid, $2::uuid)`,
    [unfinishedDistributionActivityId, input.senderUserId],
  )
  for (const [index, id] of expiredFollowerDistributionIds.entries()) {
    await input.query(
      `/* insertExpiredFederationFollowerDistributionForTest */
       INSERT INTO follower_distributions (
         id, sender_user_id, action, audience, post_id, completed_at, failed_at
       ) VALUES ($1::uuid, $2::uuid, 'post_send', 'selected_followers', $3::uuid,
         CASE WHEN $4 = 0 THEN $5::timestamptz ELSE NULL END,
         CASE WHEN $4 = 1 THEN $5::timestamptz ELSE NULL END)`,
      [id, input.senderUserId, input.postId, index, oldCompletion],
    )
    await input.query(
      `/* insertExpiredFederationFollowerSelectedRecipientForTest */
       INSERT INTO follower_distribution_selected_recipients (distribution_id, recipient_user_id)
       VALUES ($1::uuid, $2::uuid)`,
      [id, input.recipientUserId],
    )
    await input.query(
      `/* insertExpiredFederationFollowerDeliveryForTest */
       INSERT INTO follower_distribution_deliveries (distribution_id, recipient_user_id)
       VALUES ($1::uuid, $2::uuid)`,
      [id, input.recipientUserId],
    )
  }
  await input.query(
    `/* insertActiveFederationFollowerDistributionForTest */
     INSERT INTO follower_distributions (
       id, sender_user_id, action, audience, post_id
     ) VALUES ($1::uuid, $2::uuid, 'post_share', 'all_followers', $3::uuid)`,
    [activeFollowerDistributionId, input.senderUserId, input.postId],
  )
  await input.query(
    `/* insertCurrentFederationFollowerDistributionForTest */
     INSERT INTO follower_distributions (
       id, sender_user_id, action, audience, post_id, completed_at
     ) VALUES ($1::uuid, $2::uuid, 'post_share', 'all_followers', $3::uuid, $4)`,
    [currentFollowerDistributionId, input.senderUserId, input.postId, input.now],
  )
  return {
    expiredInboxActivityIds,
    currentInboxActivityId,
    expiredDistributionActivityIds,
    unfinishedDistributionActivityId,
    expiredFollowerDistributionIds,
    activeFollowerDistributionId,
    currentFollowerDistributionId,
  }
}
export async function readFederationRetentionFixtureStateForTest(
  query: TransactionQuery,
  ids: FederationRetentionFixtureIds,
): Promise<{
  inboxActivityIds: string[]
  distributionActivityIds: string[]
  followerDistributionIds: string[]
  childRowCount: number
}> {
  const inboxIds = [...ids.expiredInboxActivityIds, ids.currentInboxActivityId]
  const distributionIds = [
    ...ids.expiredDistributionActivityIds,
    ids.unfinishedDistributionActivityId,
  ]
  const followerIds = [
    ...ids.expiredFollowerDistributionIds,
    ids.activeFollowerDistributionId,
    ids.currentFollowerDistributionId,
  ]
  const { rows: inbox } = await query<{ id: string }>(
    `/* readFederationRetentionInboxFixturesForTest */
     SELECT id FROM activitypub_inbox_activities WHERE id = ANY($1::uuid[]) ORDER BY id`,
    [inboxIds],
  )
  const { rows: distributions } = await query<{ activity_id: string }>(
    `/* readFederationRetentionDistributionFixturesForTest */
     SELECT activity_id FROM activitypub_distribution_work_items
     WHERE activity_id = ANY($1::uuid[]) ORDER BY activity_id`,
    [distributionIds],
  )
  const { rows: followers } = await query<{ id: string }>(
    `/* readFederationRetentionFollowerFixturesForTest */
     SELECT id FROM follower_distributions WHERE id = ANY($1::uuid[]) ORDER BY id`,
    [followerIds],
  )
  const { rows: children } = await query<{ count: string }>(
    `/* countFederationRetentionFixtureChildrenForTest */
     SELECT (
       (SELECT count(*) FROM follower_distribution_deliveries
        WHERE distribution_id = ANY($1::uuid[])) +
       (SELECT count(*) FROM follower_distribution_selected_recipients
        WHERE distribution_id = ANY($1::uuid[]))
     )::text AS count`,
    [ids.expiredFollowerDistributionIds],
  )
  return {
    inboxActivityIds: inbox.map(row => row.id),
    distributionActivityIds: distributions.map(row => row.activity_id),
    followerDistributionIds: followers.map(row => row.id),
    childRowCount: Number(children[0]?.count ?? 0),
  }
}
