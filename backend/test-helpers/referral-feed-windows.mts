import { randomInt } from 'node:crypto'
import { onTestFinished } from 'vitest'
import { v7 } from 'uuid'
import { beginTransaction, write } from '@data-stores/psql'
import { encodeCursor } from '@modules/pagination'
import { createTestUser } from './entities/users.mts'
import { createTestUrlWithHostname } from './entities/urls.mts'
import { followUser } from './entities/test-entities.mts'

/**
 * Deleting a topic probes every foreign key that references it, so cleanup cost scales with the
 * topic count. Hidden rows share topics; the feed keeps one live link per (user, topic), so every
 * row a test expects to see needs its own.
 */
const HIDDEN_ROWS_PER_TOPIC = 10

/** An owned historical range keeps unrelated current test rows above the initial cursor. */
export async function createReferralFeedWindowFixture(
  kinds: readonly ('visible' | 'unfollowed' | 'deleted' | 'deactivated')[],
) {
  const viewer = await createTestUser()
  const author = await createTestUser()
  const stranger = await createTestUser()
  await followUser(viewer, author)
  const urlIds = await Promise.all(
    Array.from({ length: HIDDEN_ROWS_PER_TOPIC }, () => createTestUrlWithHostname()),
  )
  const base = Date.UTC(1971, 0, 1) + randomInt(1, 1_000_000) * 10_000
  const topicPool: string[] = []
  const hidden = new Map<string, { topicId: string; count: number }>()
  const rows = kinds.map((kind, index) => {
    const userId = kind === 'unfollowed' ? stranger.id : author.id
    let topicId: string
    let urlId = urlIds[0]!
    if (kind === 'visible') {
      topicId = v7()
      topicPool.push(topicId)
    } else {
      // Hidden rows of one user share a topic across distinct urls (live-link unique key).
      let state = hidden.get(userId)
      if (!state || state.count % HIDDEN_ROWS_PER_TOPIC === 0) {
        state = { topicId: v7(), count: state?.count ?? 0 }
        topicPool.push(state.topicId)
        hidden.set(userId, state)
      }
      topicId = state.topicId
      urlId = urlIds[state.count % HIDDEN_ROWS_PER_TOPIC]!
      state.count++
    }
    return {
      id: v7({ msecs: base + kinds.length - index }),
      topic_id: topicId,
      url_id: urlId,
      user_id: userId,
      kind,
    }
  })
  const ids = rows.map(row => row.id)
  const topicIds = topicPool
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
      FROM unnest($1::uuid[]) AS input(topic_id)`,
    [topicIds],
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
      SELECT id, user_id, topic_id, url_id,
        CASE WHEN kind = 'deactivated' THEN NULL ELSE CURRENT_TIMESTAMP END,
        CASE WHEN kind = 'deactivated' THEN CURRENT_TIMESTAMP ELSE NULL END,
        CASE WHEN kind = 'deleted' THEN CURRENT_TIMESTAMP ELSE NULL END, 'system'
      FROM jsonb_to_recordset($1::jsonb) AS input(id uuid, topic_id uuid, url_id uuid, user_id uuid, kind text)`,
    [JSON.stringify(rows)],
  )
  await query.commit()
  return {
    viewer,
    author,
    ids,
    after: encodeCursor({ id: v7({ msecs: base + kinds.length + 1 }) }),
  }
}
