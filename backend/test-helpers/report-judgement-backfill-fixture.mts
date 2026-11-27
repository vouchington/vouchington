import { write } from '@data-stores/psql'
import {
  advanceJudgementBackfillCursor,
  readJudgementBackfillCursor,
} from '../services/moderation-reports/judgement-backfill-cursor.mts'
import { v7 as uuidv7 } from 'uuid'
import { createTestUser } from './entities/users.mts'

export async function seedJudgementBackfillPosts(
  ids: readonly string[],
  reporter: string,
): Promise<string[]> {
  const { rows } = await write<{ id: string }>(
    `/* seedJudgementBackfillPostsForTest */
    WITH seeded_posts AS (
      INSERT INTO posts (
        id, created_by_id, post_type, title, markdown, created_via,
        bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256
      )
      SELECT target.id, $2::uuid, 'discussion', 'Judgement backfill fixture', 'Body', 'system',
        decode(repeat('00', 32), 'hex'), decode(repeat('00', 32), 'hex')
      FROM unnest($1::uuid[]) target(id) RETURNING id
    ), cases AS (
      INSERT INTO moderation_cases (post_id) SELECT id FROM seeded_posts RETURNING id, post_id
    ), reports AS (
      INSERT INTO moderation_reports (created_via, reporter_user_id, post_id, case_id, reason, original_reason)
      SELECT 'system', $2::uuid, post_id, id, 'spam', 'spam' FROM cases RETURNING id, post_id
    )
    SELECT id FROM reports ORDER BY post_id`,
    [ids, reporter],
  )
  return rows.map(row => row.id)
}

export async function withTestJudgementBackfillRun(
  exercise: (postIds: readonly string[], reportIds: readonly string[]) => Promise<void>,
): Promise<void> {
  const { id: reporter } = await createTestUser()
  const prefix = uuidv7({ msecs: Date.UTC(2020, 1, 2) }).slice(0, -8)
  const start = `${prefix}00000000`
  const end = `${prefix}00000005`
  const ids = [1, 2, 3, 4].map(index => prefix + index.toString(16).padStart(8, '0'))
  const original = await readJudgementBackfillCursor()
  if (
    !(await advanceJudgementBackfillCursor(original, {
      target_kind: 'post',
      cursor_target_id: start,
      sweep_upper_bound_id: end,
      is_sweep_complete: false,
    }))
  ) {
    throw new Error('Could not position the judgement backfill fixture')
  }

  await using cleanup = new AsyncDisposableStack()
  cleanup.defer(async () => {
    const current = await readJudgementBackfillCursor()
    await write(
      '/* cleanupJudgementBackfillTestPosts */ DELETE FROM posts WHERE id = ANY($1::uuid[])',
      [ids],
    )
    if (
      current.sweep_upper_bound_id !== end ||
      !(await advanceJudgementBackfillCursor(current, original))
    ) {
      throw new Error('The judgement backfill fixture lost its checkpoint')
    }
  })
  await exercise(ids, await seedJudgementBackfillPosts(ids, reporter))
}
