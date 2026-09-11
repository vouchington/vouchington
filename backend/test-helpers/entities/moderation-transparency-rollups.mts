import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Returns the rollup mutator definition for structural cascade-lock regressions. */
export async function getTestModerationTransparencyRollupFunctionDefinition(): Promise<string> {
  const { rows } = await read<{ definition: string }>(sql`
    SELECT pg_get_functiondef(
      'fn_apply_moderation_transparency_daily_rollup(timestamp with time zone,uuid,text,text,integer)'::regprocedure
    ) AS definition
  `)
  return rows[0]!.definition
}

export async function getTestModerationTransparencyClearanceRollupFunctionDefinition(): Promise<string> {
  const { rows } = await read<{ definition: string }>(sql`
    SELECT pg_get_functiondef('fn_moderation_transparency_clearance_insert_rollup()'::regprocedure) AS definition
  `)
  return rows[0]!.definition
}

/** Returns every hard-delete mutator so tests can guard transition-table aggregation. */
export async function getTestModerationTransparencyDeleteRollupFunctionDefinitions(): Promise<
  Record<string, string>
> {
  const { rows } = await read<{ name: string; definition: string }>(sql`
    SELECT p.proname AS name, pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    WHERE p.proname = ANY(
      ARRAY[
        'fn_moderation_transparency_reports_delete_rollup',
        'fn_moderation_transparency_actions_delete_rollup',
        'fn_moderation_transparency_agent_delete_rollup',
        'fn_moderation_transparency_appeals_delete_rollup',
        'fn_moderation_transparency_clearance_delete_rollup'
      ]
    )
  `)
  return Object.fromEntries(rows.map(row => [row.name, row.definition]))
}

export async function getTestModerationTransparencyRollupCount(options: {
  occurredAt: Date
  communityId?: string
  metric: string
  category: string
}): Promise<number | undefined> {
  const day = options.occurredAt.toISOString().slice(0, 10)
  const { rows } = await read<{ count: number }>(sql`/* getTestModerationTransparencyRollupCount */
    SELECT count
    FROM moderation_transparency_daily_rollups
    WHERE community_id IS NOT DISTINCT FROM ${options.communityId ?? null}::uuid
      AND day = ${day}::date
      AND metric = ${options.metric}
      AND category = ${options.category}
  `)
  return rows[0]?.count
}

export async function insertTestModerationTransparencyRollupRow(options: {
  occurredAt: Date
  communityId?: string
  metric: string
  category: string
  count: number
}): Promise<void> {
  const day = options.occurredAt.toISOString().slice(0, 10)
  await write(sql`/* insertTestModerationTransparencyRollupRow */
    INSERT INTO moderation_transparency_daily_rollups(
      day, community_id, metric, category, count, latest_occurred_at
    ) VALUES (
      ${day}::date, ${options.communityId ?? null}::uuid, ${options.metric}, ${options.category},
      ${options.count}, ${options.occurredAt}
    )
  `)
}

export async function insertTestReleasedModerationTransparencyRollupRow(options: {
  occurredAt: Date
  metric: string
  category: string
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
  metric: string
  category: string
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

/**
 * Day-free, category-scoped community rollup counts for a freshly created community only.
 * Unlike {@link getTestModerationTransparencyRollupCount}, this does not take an `occurredAt` — the caller
 * cannot control the day a production-path rollup lands on (it is derived from a UUIDv7 minted
 * inside the trigger, not a parameter), so pinning a day here would be a second source of flake.
 * Categories with no rollup row are omitted rather than returned as zero. `categories` must be
 * non-empty — an empty array matches no rows and silently resolves to `{}`. Do not reuse for a
 * shared/reused community without adding a day bound.
 */
export async function getTestCommunityModerationTransparencyRollupCounts(options: {
  communityId: string
  metric: string
  categories: readonly string[]
}): Promise<Record<string, number>> {
  const { rows } = await read<{ category: string; count: number }>(sql`
    /* getTestCommunityModerationTransparencyRollupCounts */
    SELECT category, sum(count)::int AS count
    FROM moderation_transparency_daily_rollups
    WHERE community_id = ${options.communityId}::uuid
      AND metric = ${options.metric}
      AND category = ANY(${options.categories}::text[])
    GROUP BY category
  `)
  return Object.fromEntries(rows.map(row => [row.category, row.count]))
}

export async function getTestCommunityModerationTransparencyRollupVersion(
  communityId: string,
): Promise<{ count: number; rowVersion: string } | undefined> {
  const { rows } = await read<{ count: number; rowVersion: string }>(sql`
    SELECT count, xmin::text AS "rowVersion"
    FROM moderation_transparency_daily_rollups
    WHERE community_id = ${communityId}::uuid
      AND metric = 'automated_moderation'
      AND category = 'community_ai'
  `)
  return rows[0]
}

export async function updateTestReleasedModerationTransparencyRollup(options: {
  occurredAt: Date
  metric: string
  category: string
}): Promise<void> {
  const day = options.occurredAt.toISOString().slice(0, 10)
  await write(sql`/* updateTestReleasedModerationTransparencyRollup */
    UPDATE moderation_transparency_released_daily_rollups
    SET count = count
    WHERE community_id IS NULL AND day = ${day}::date
      AND metric = ${options.metric} AND category = ${options.category}
  `)
}

export async function deleteTestReleasedModerationTransparencyRollup(options: {
  occurredAt: Date
  metric: string
  category: string
}): Promise<void> {
  const day = options.occurredAt.toISOString().slice(0, 10)
  await write(sql`/* deleteTestReleasedModerationTransparencyRollup */
    DELETE FROM moderation_transparency_released_daily_rollups
    WHERE community_id IS NULL AND day = ${day}::date
      AND metric = ${options.metric} AND category = ${options.category}
  `)
}
