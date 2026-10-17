import { write, type QueryOptions, type TransactionQuery } from '@data-stores/psql'
import assert from 'http-assert'

export type RssFeedStateKind = 'discoverability' | 'enablement'

export type RssFeedStateInsert = {
  kind: RssFeedStateKind
  is_enabled: boolean
  reason?: string | null
}

export type LatestRssFeedState = { is_enabled: boolean; changed_by_id: string | null }

function assertReason(reason: string | null | undefined): void {
  assert(reason === undefined || reason === null || reason.length <= 1000, 400, 'reason too long')
}

/** Appends one decision per kind to the feed's setting history in a single statement. */
export async function insertRssFeedStateChanges(
  rssFeedId: string,
  changes: readonly RssFeedStateInsert[],
  createdById: string | null,
  options: QueryOptions = {},
): Promise<void> {
  for (const change of changes) assertReason(change.reason)
  await write(
    `/* insertRssFeedSettingChange */
    INSERT INTO rss_feed_setting_changes (rss_feed_id, is_enabled, changed_by_id, reason, change_type)
    SELECT $1, change.is_enabled, $2, change.reason, change.change_type
    FROM unnest($3::boolean[], $4::text[], $5::rss_feed_setting_change_types[])
      AS change(is_enabled, reason, change_type)`,
    [
      rssFeedId,
      createdById,
      changes.map(change => change.is_enabled),
      changes.map(change => change.reason ?? null),
      changes.map(change => change.kind),
    ],
    options,
  )
}

/** Locks the latest decision of each kind, returning only the kinds that have one. */
export async function lockLatestRssFeedStates(
  query: TransactionQuery,
  rssFeedId: string,
  kinds: readonly RssFeedStateKind[],
): Promise<Map<RssFeedStateKind, LatestRssFeedState>> {
  const { rows } = await query(
    `/* lockLatestRssFeedStates */
      SELECT kind.change_type, latest.is_enabled, latest.changed_by_id
      FROM unnest($2::rss_feed_setting_change_types[]) AS kind(change_type)
      CROSS JOIN LATERAL (
        SELECT is_enabled, changed_by_id
        FROM rss_feed_setting_changes
        WHERE rss_feed_id = $1 AND change_type = kind.change_type
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE
      ) latest`,
    [rssFeedId, kinds],
  )
  return new Map(
    (rows as Array<LatestRssFeedState & { change_type: RssFeedStateKind }>).map(row => [
      row.change_type,
      { is_enabled: row.is_enabled, changed_by_id: row.changed_by_id },
    ]),
  )
}
