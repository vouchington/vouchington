import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { onTestFinished } from 'vitest'
import { getMinUUIDv7ForDate } from '@modules/utils'
import type { HistoryKind } from '../services/data-retention/cleanup-histories.mts'
import { acquireTestPostgresAdvisoryLock } from './postgres-advisory-lock.mts'

/** Serializes every raw-page assertion and its cleanup across dirty-DB forks. */
export function acquireHistoryRetentionSweepTestLock() {
  return acquireTestPostgresAdvisoryLock({ namespace: 1_447_904_068, key: 3644, timeout: '25s' })
}

export async function reserveHistoryRetentionFixtureIds(kind: HistoryKind): Promise<string[]> {
  const lock = await acquireHistoryRetentionSweepTestLock()
  const ids: string[] = []
  onTestFinished(async () => {
    try {
      await cleanupHistoryFixtureIds(kind, ids)
    } finally {
      await lock.release()
    }
  })
  return ids
}

export async function positionHistoryCursorForTest(kind: HistoryKind, before: Date): Promise<void> {
  const cursorId = getMinUUIDv7ForDate(before)
  await write(sql`/* positionHistoryCursorForTest */
    INSERT INTO history_retention_cursors (cleanup_name, cursor_id)
    VALUES (${kind}::history_retention_cleanup_names, ${cursorId}::uuid)
    ON CONFLICT (cleanup_name) DO UPDATE
      SET cursor_id = EXCLUDED.cursor_id, sweep_cutoff_id = NULL, is_sweep_complete = FALSE`)
}

type HistoryCursorSnapshot = {
  cursor_id: string | null
  sweep_cutoff_id: string | null
  is_sweep_complete: boolean
} | null

export async function snapshotHistoryCursorForTest(
  kind: HistoryKind,
): Promise<HistoryCursorSnapshot> {
  const { rows } = await write<
    NonNullable<HistoryCursorSnapshot>
  >(sql`/* snapshotHistoryCursorForTest */
    SELECT cursor_id, sweep_cutoff_id, is_sweep_complete FROM history_retention_cursors
    WHERE cleanup_name = ${kind}::history_retention_cleanup_names`)
  return rows[0] ?? null
}

export async function restoreHistoryCursorForTest(
  kind: HistoryKind,
  prior: HistoryCursorSnapshot,
): Promise<void> {
  if (prior === null) {
    await write(sql`/* removeTestHistoryCursor */
      DELETE FROM history_retention_cursors WHERE cleanup_name = ${kind}::history_retention_cleanup_names`)
    return
  }
  await write(sql`/* restoreHistoryCursorForTest */
    INSERT INTO history_retention_cursors (cleanup_name, cursor_id, sweep_cutoff_id, is_sweep_complete)
    VALUES (${kind}::history_retention_cleanup_names, ${prior.cursor_id}::uuid,
      ${prior.sweep_cutoff_id}::uuid, ${prior.is_sweep_complete})
    ON CONFLICT (cleanup_name) DO UPDATE SET cursor_id = EXCLUDED.cursor_id,
      sweep_cutoff_id = EXCLUDED.sweep_cutoff_id, is_sweep_complete = EXCLUDED.is_sweep_complete`)
}

export async function readRemainingHistoryIds(kind: HistoryKind, ids: string[]): Promise<string[]> {
  let result
  switch (kind) {
    case 'dynamic_configuration_revisions':
      result = await write<{ id: string }>(sql`/* readRemainingConfigHistoryIds */
        SELECT id FROM dynamic_configuration_revisions WHERE id = ANY(${ids}::uuid[]) ORDER BY id`)
      break
    case 'rss_feed_setting_changes':
      result = await write<{ id: string }>(sql`/* readRemainingRssSettingHistoryIds */
        SELECT id FROM rss_feed_setting_changes WHERE id = ANY(${ids}::uuid[]) ORDER BY id`)
      break
    case 'fediverse_instance_integration_changes':
      result = await write<{ id: string }>(sql`/* readRemainingFediverseHistoryIds */
        SELECT id FROM fediverse_instance_integration_changes WHERE id = ANY(${ids}::uuid[]) ORDER BY id`)
      break
    case 'community_agent_prompt_revisions':
      result = await write<{ id: string }>(sql`/* readRemainingPromptHistoryIds */
        SELECT id FROM community_agent_prompt_revisions WHERE id = ANY(${ids}::uuid[]) ORDER BY id`)
      break
    case 'followed_user_import_requests':
    case 'pending_user_import_requests':
      result = await write<{ id: string }>(sql`/* readRemainingImportHistoryIds */
        SELECT id FROM user_import_requests WHERE id = ANY(${ids}::uuid[]) ORDER BY id`)
      break
    case 'referral_attribution_scrub':
    case 'referral_attribution_expiry':
      result = await write<{ id: string }>(sql`/* readRemainingReferralHistoryIds */
        SELECT id FROM session_referral_attributions WHERE id = ANY(${ids}::uuid[]) ORDER BY id`)
      break
  }
  return result.rows.map(row => row.id)
}

export async function readReferralDetails(id: string): Promise<{
  landing_url: string | null
  utm_source: string | null
  utm_medium: string | null
} | null> {
  const { rows } = await write<{
    landing_url: string | null
    utm_source: string | null
    utm_medium: string | null
  }>(sql`/* readReferralDetailsForRetention */
    SELECT landing_url, utm_source, utm_medium
    FROM session_referral_attributions WHERE id = ${id} LIMIT 1`)
  return rows[0] ?? null
}

export async function readHistoryCursor(kind: HistoryKind): Promise<{
  cursor_id: string | null
  sweep_cutoff_id: string | null
} | null> {
  const { rows } = await write<{
    cursor_id: string | null
    sweep_cutoff_id: string | null
  }>(sql`/* readHistoryCursorForTest */
    SELECT cursor_id, sweep_cutoff_id FROM history_retention_cursors
    WHERE cleanup_name = ${kind}::history_retention_cleanup_names LIMIT 1`)
  return rows[0] ?? null
}

export async function attemptDirectConfigHistoryDelete(id: string): Promise<void> {
  await write(sql`/* attemptDirectConfigHistoryDelete */
    DELETE FROM dynamic_configuration_revisions WHERE id = ${id}`)
}

export async function attemptDirectConfigHistoryUpdate(id: string): Promise<void> {
  await write(sql`/* attemptDirectConfigHistoryUpdate */
    UPDATE dynamic_configuration_revisions SET changes = '{"changed":true}'::jsonb WHERE id = ${id}`)
}

export async function attemptFlaggedConfigHistoryUpdate(id: string): Promise<void> {
  await using query = await beginTransaction()
  await query(
    sql`/* enableFlagForHistoryUpdateTest */ SELECT set_config('app.history_retention_cleanup', 'on', true)`,
  )
  await query(sql`/* attemptFlaggedConfigHistoryUpdate */
    UPDATE dynamic_configuration_revisions SET changes = '{"changed":true}'::jsonb WHERE id = ${id}`)
  await query.commit()
}

/** Remove only a test's synthetic rows, including immutable histories. */
export async function cleanupHistoryFixtureIds(kind: HistoryKind, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await using query = await beginTransaction()
  await query(
    sql`/* allowTestHistoryRetentionCleanup */ SELECT set_config('app.history_retention_cleanup', 'on', true)`,
  )
  switch (kind) {
    case 'dynamic_configuration_revisions':
      await query(
        sql`/* cleanTestConfigHistory */ DELETE FROM dynamic_configuration_revisions WHERE id = ANY(${ids}::uuid[])`,
      )
      break
    case 'rss_feed_setting_changes':
      await query(
        sql`/* cleanTestRssSettingHistory */ DELETE FROM rss_feed_setting_changes WHERE id = ANY(${ids}::uuid[])`,
      )
      break
    case 'fediverse_instance_integration_changes':
      await query(
        sql`/* cleanTestFediverseHistory */ DELETE FROM fediverse_instance_integration_changes WHERE id = ANY(${ids}::uuid[])`,
      )
      break
    case 'community_agent_prompt_revisions':
      await query(
        sql`/* cleanTestPromptHistory */ DELETE FROM community_agent_prompt_revisions WHERE id = ANY(${ids}::uuid[])`,
      )
      break
    case 'followed_user_import_requests':
    case 'pending_user_import_requests':
      await query(
        sql`/* cleanTestImportHistory */ DELETE FROM user_import_requests WHERE id = ANY(${ids}::uuid[])`,
      )
      break
    case 'referral_attribution_scrub':
    case 'referral_attribution_expiry':
      await query(
        sql`/* cleanTestReferralHistory */ DELETE FROM session_referral_attributions WHERE id = ANY(${ids}::uuid[])`,
      )
      break
  }
  await query.commit()
}
