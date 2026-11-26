import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import {
  EXPOSURE_BREAK_THRESHOLD,
  EXPOSURE_COOLDOWN_MINUTES,
  EXPOSURE_COUNT_DISPLAY_CAP_MAX,
  EXPOSURE_WINDOW_MINUTES,
  getExposureCountDisplayCap,
} from '@services/moderation-exposure/config'
import { getExposureState } from '@services/moderation-exposure/get'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedPostId } from '../run-support.mts'

const SCENARIO = 'moderation-exposure-state-at-cap'
const QUERY = 'getExposureState'
const RECENT_REVEALS = EXPOSURE_COUNT_DISPLAY_CAP_MAX + 65
const EXPIRED_REVEALS = 150

async function seedExposureReveals(moderatorIds: string[]) {
  const { rows } = await write<{ threshold_at: Date }>(
    `/* seedModerationExposureCapacity */
    WITH moderators AS (
      INSERT INTO users (id, username)
      SELECT id, 'explain-exposure-' || id FROM unnest($1::uuid[]) AS scope(id)
      RETURNING id
    ), fixture AS MATERIALIZED (
      SELECT uuidv7() AS id, n, moderator.id AS moderator_id,
        CASE WHEN moderator.id = ($1::uuid[])[3] OR n > $3
          THEN CURRENT_TIMESTAMP - ($5::int + 1) * interval '1 minute'
          ELSE CURRENT_TIMESTAMP - interval '8 minutes' + n * interval '50 milliseconds'
        END AS revealed_at
      FROM moderators moderator
      CROSS JOIN LATERAL generate_series(1, CASE WHEN moderator.id = ($1::uuid[])[3]
        THEN $4::int ELSE $3::int + $4::int END) n
    ), reveals AS (
      INSERT INTO moderation_media_reveals (id, moderator_user_id, post_id, surface, revealed_at)
      SELECT id, moderator_id,
        CASE WHEN n <= 2 OR n > $3 - 32 THEN $2::uuid END,
        CASE WHEN n = 2 THEN 'post_page'::moderation_media_reveal_surfaces ELSE 'mod_queue' END,
        revealed_at
      FROM fixture RETURNING id, revealed_at
    )
    SELECT reveals.revealed_at AS threshold_at
    FROM fixture JOIN reveals USING (id)
    WHERE fixture.moderator_id = ($1::uuid[])[1] AND fixture.n = $6::int + 1`,
    [
      moderatorIds,
      seedPostId,
      RECENT_REVEALS,
      EXPIRED_REVEALS,
      EXPOSURE_WINDOW_MINUTES,
      EXPOSURE_BREAK_THRESHOLD,
    ],
  )
  return rows[0]?.threshold_at
}

export async function runModerationExposureCapacity(): Promise<void> {
  const moderatorIds = [randomUUID(), randomUUID(), randomUUID()]
  const [targetId, , expiredOnlyId] = moderatorIds
  assert.ok(targetId && expiredOnlyId)
  try {
    const thresholdAt = await seedExposureReveals(moderatorIds)
    assert.ok(thresholdAt)
    const cooldownEndsAt = new Date(
      thresholdAt.getTime() + EXPOSURE_COOLDOWN_MINUTES * 60_000,
    ).toISOString()
    registerScenarioContract(SCENARIO, {
      expectations: [
        // The hard ceiling applies after sorting recent rows and deduplicated entities.
        // https://github.com/vouchington/vouchington/issues/6374#issuecomment-7192362525
        { kind: 'maxProcessedRows', relation: 'moderation_media_reveals', max: RECENT_REVEALS },
        { kind: 'maxInputRows', nodeType: 'Sort', max: 2_095 },
      ],
    })
    await runAndCapture(
      SCENARIO,
      async () => {
        assert.deepEqual(await getExposureState(targetId), {
          count: getExposureCountDisplayCap(),
          count_capped: true,
          threshold: EXPOSURE_BREAK_THRESHOLD,
          in_cooldown: true,
          cooldown_ends_at: cooldownEndsAt,
        })
        assert.deepEqual(await getExposureState(expiredOnlyId), {
          count: 0,
          count_capped: false,
          threshold: EXPOSURE_BREAK_THRESHOLD,
          in_cooldown: false,
          cooldown_ends_at: null,
        })
      },
      undefined,
      QUERY,
      { exactCapturedNames: [QUERY, QUERY] },
    )
  } finally {
    await using query = await beginTransaction()
    await query(
      '/* cleanupModerationExposureCapacityReveals */ DELETE FROM moderation_media_reveals WHERE moderator_user_id = ANY($1::uuid[])',
      [moderatorIds],
    )
    await query(
      '/* cleanupModerationExposureCapacityModerators */ DELETE FROM users WHERE id = ANY($1::uuid[])',
      [moderatorIds],
    )
    await query.commit()
  }
}
