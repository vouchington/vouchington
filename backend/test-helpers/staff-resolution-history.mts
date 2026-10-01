import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestUser } from './entities/users.mts'
import { insertTestUserWarning } from './entities/user-warnings.mts'
import { insertTestModerationAppeal } from './entities/moderation-appeals.mts'
import { insertTestReviewDispute } from './entities/review-disputes.mts'
import { insertTestPost, insertTestPostReview } from './entities/posts.mts'
import { insertTestTopic } from './entities/topics.mts'

export async function createStaffResolutionFixture(kind: 'appeal' | 'dispute', delivered = true) {
  const actor = await createTestUser()
  const target = await createTestUser()
  if (kind === 'appeal') {
    const warning = await insertTestUserWarning({ userId: target.id, issuedById: actor.id })
    const appeal = await insertTestModerationAppeal({
      appellantId: target.id,
      userWarningId: warning.id,
    })
    if (delivered)
      await write(sql`/* createStaffResolutionFixture */
      UPDATE moderation_appeals SET sent_at = CURRENT_TIMESTAMP, approved_at = CURRENT_TIMESTAMP,
        approved_by_id = ${actor.id}, public_response = 'Reviewed response'
      WHERE id = ${appeal.id}`)
    return { actorId: actor.id, id: appeal.id }
  }
  const suffix = crypto.randomUUID()
  const topicId = await insertTestTopic({
    createdById: target.id,
    name: `Audit ${suffix}`,
    slug: `audit-${suffix}`,
  })
  const postId = await insertTestPost({
    createdById: target.id,
    postType: 'review',
    title: `Audit ${suffix}`,
    slug: `audit-${suffix}`,
    markdown: 'Synthetic audit review.',
  })
  await insertTestPostReview(postId, topicId, 3)
  const id = await insertTestReviewDispute({ postId, topicId, disputantUserId: target.id })
  return { actorId: actor.id, id }
}

export async function readStaffResolutionState(kind: 'appeal' | 'dispute', id: string) {
  const table = kind === 'appeal' ? 'moderation_appeals' : 'review_disputes'
  const query = sql`/* readStaffResolutionState */ SELECT to_jsonb(target) AS state FROM `
  query.append(table).append(sql` target WHERE id = ${id}`)
  const { rows } = await write<{ state: Record<string, unknown> }>(query)
  return rows[0]!.state
}

export async function readStaffDraftHistory(kind: 'appeal' | 'dispute', id: string) {
  const table =
    kind === 'appeal' ? 'moderation_appeal_lifecycle_changes' : 'review_dispute_lifecycle_changes'
  const column = kind === 'appeal' ? 'moderation_appeal_id' : 'review_dispute_id'
  const query = sql`/* readStaffDraftHistory */ SELECT metadata FROM `
  query
    .append(table)
    .append(' WHERE ')
    .append(column)
    .append(sql` = ${id} AND change_type = 'edit' ORDER BY id DESC LIMIT 1`)
  const { rows } = await write<{ metadata: Record<string, unknown> }>(query)
  return rows[0]!.metadata
}
