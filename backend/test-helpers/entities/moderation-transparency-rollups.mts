import type { FiniteValue } from '@data-stores/psql/finite-values/index'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function insertTestReleasedModerationTransparencyRollupRow(options: {
  occurredAt: Date
  metric: FiniteValue<'moderation_transparency_metrics'>
  category: FiniteValue<'moderation_transparency_categories'>
  count: number
}): Promise<void> {
  const day = options.occurredAt.toISOString().slice(0, 10)
  await write(sql`/* insertTestReleasedModerationTransparencyRollupRow */
    INSERT INTO moderation_transparency_released_daily_rollups(
      day, community_id, metric, category, count, latest_occurred_at
    ) VALUES (${day}::date, NULL, ${options.metric}, ${options.category}, ${options.count}, ${options.occurredAt})
  `)
}

export async function getTestReleasedModerationTransparencyRollupCount(options: {
  occurredAt: Date
  metric: FiniteValue<'moderation_transparency_metrics'>
  category: FiniteValue<'moderation_transparency_categories'>
}): Promise<number | undefined> {
  const day = options.occurredAt.toISOString().slice(0, 10)
  const { rows } = await read<{ count: number }>(sql`
    /* getTestReleasedModerationTransparencyRollupCount */
    SELECT count
    FROM moderation_transparency_released_daily_rollups
    WHERE community_id IS NULL AND day = ${day}::date
      AND metric = ${options.metric} AND category = ${options.category}
  `)
  return rows[0]?.count
}

export async function updateTestReleasedModerationTransparencyRollup(options: {
  occurredAt: Date
  metric: FiniteValue<'moderation_transparency_metrics'>
  category: FiniteValue<'moderation_transparency_categories'>
}): Promise<void> {
  const day = options.occurredAt.toISOString().slice(0, 10)
  await write(sql`/* updateTestReleasedModerationTransparencyRollup */
    UPDATE moderation_transparency_released_daily_rollups
    SET count = count + 1
    WHERE community_id IS NULL AND day = ${day}::date
      AND metric = ${options.metric} AND category = ${options.category}
  `)
}

export async function deleteTestReleasedModerationTransparencyRollup(options: {
  occurredAt: Date
  metric: FiniteValue<'moderation_transparency_metrics'>
  category: FiniteValue<'moderation_transparency_categories'>
}): Promise<void> {
  const day = options.occurredAt.toISOString().slice(0, 10)
  await write(sql`/* deleteTestReleasedModerationTransparencyRollup */
    DELETE FROM moderation_transparency_released_daily_rollups
    WHERE community_id IS NULL AND day = ${day}::date
      AND metric = ${options.metric} AND category = ${options.category}
  `)
}
