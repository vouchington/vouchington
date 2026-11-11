import { randomInt } from 'node:crypto'
import { onTestFinished } from 'vitest'
import { v7 } from 'uuid'
import { beginTransaction, write } from '@data-stores/psql'
import { encodeCursor } from '@modules/pagination'
import { createTestUser } from './entities/users.mts'
import { createTestUrlWithHostname } from './entities/urls.mts'
import { followUser } from './entities/test-entities.mts'

/** An owned historical range keeps unrelated current test rows above the initial cursor. */
export async function createReferralFeedWindowFixture(
  kinds: readonly ('visible' | 'unfollowed' | 'deleted' | 'deactivated')[],
) {
  const viewer = await createTestUser()
  const author = await createTestUser()
  const stranger = await createTestUser()
  await followUser(viewer, author)
  const urlId = await createTestUrlWithHostname()
  const base = Date.UTC(1971, 0, 1) + randomInt(1, 1_000_000) * 10_000
  const rows = kinds.map((kind, index) => ({
    id: v7({ msecs: base + kinds.length - index }),
    topic_id: v7(),
    user_id: kind === 'unfollowed' ? stranger.id : author.id,
    kind,
  }))
  const ids = rows.map(row => row.id)
  const topicIds = rows.map(row => row.topic_id)
  onTestFinished(async () => {
    await write(
      `/* cleanupReferralFeedWindowLinks */
      DELETE FROM user_referral_program_links WHERE id = ANY($1::uuid[])`,
      [ids],
    )
    await write(
      `/* cleanupReferralFeedWindowTopics */
      DELETE FROM topics WHERE id = ANY($1::uuid[])`,
      [topicIds],
    )
  })
  await using query = await beginTransaction()
  await query(
    `/* createReferralFeedWindowTopics */ INSERT INTO topics
      (id, topic_type, name, slug, created_via, bedrock_nova_multimodal_v1_content_sha256)
      SELECT topic_id, 'referral_program', 'Window program ' || topic_id,
        'window-program-' || topic_id, 'system', decode(repeat('c4', 32), 'hex')
      FROM jsonb_to_recordset($1::jsonb) AS input(topic_id uuid)`,
    [JSON.stringify(rows)],
  )
  await query(
    `/* createReferralFeedWindowPrograms */ INSERT INTO referral_program_topics (topic_id, enabled_at)
      SELECT id, CURRENT_TIMESTAMP FROM unnest($1::uuid[]) AS input(id)`,
    [topicIds],
  )
  await query(
    `/* createReferralFeedWindowLinks */ INSERT INTO user_referral_program_links
      (id, user_id, referral_program_topic_id, url_id, activated_at, deactivated_at,
        deleted_at, created_via)
      SELECT id, user_id, topic_id, $2,
        CASE WHEN kind = 'deactivated' THEN NULL ELSE CURRENT_TIMESTAMP END,
        CASE WHEN kind = 'deactivated' THEN CURRENT_TIMESTAMP ELSE NULL END,
        CASE WHEN kind = 'deleted' THEN CURRENT_TIMESTAMP ELSE NULL END, 'system'
      FROM jsonb_to_recordset($1::jsonb) AS input(id uuid, topic_id uuid, user_id uuid, kind text)`,
    [JSON.stringify(rows), urlId],
  )
  await query.commit()
  return {
    viewer,
    author,
    ids,
    after: encodeCursor({ id: v7({ msecs: base + kinds.length + 1 }) }),
  }
}
