import type { TransactionQuery } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { lockCopyrightRationaleRetentionPage } from '@services/copyright-notices/retention-erasure-preservation'
import { sourcePlan, type Source } from './security-record-plans.mts'

/** Run one cursor page inside the caller's transaction; the caller owns commit or rollback. */
export async function cleanupSecuritySourcePageInTransaction(
  query: TransactionQuery,
  source: Source,
  batchSize: number,
  now: Date,
): Promise<{ deleted: number; hasMore: boolean }> {
  const plan = sourcePlan(source, now)
  const cutoffId = getMinUUIDv7ForDate(plan.cutoffAt)
  await query(
    `/* ensureSecurityRetentionCursor */
     INSERT INTO security_retention_cleanup_cursors (source)
     VALUES ($1::security_retention_sources) ON CONFLICT (source) DO NOTHING`,
    [source],
  )
  const progress = await query<{ cursor_at: string | null; cursor_id: string | null }>(
    `/* lockSecurityRetentionCursor */
     SELECT cursor_at::text AS cursor_at, cursor_id FROM security_retention_cleanup_cursors
     WHERE source = $1::security_retention_sources FOR UPDATE`,
    [source],
  )
  const cursor = progress.rows[0]
  if (!cursor) throw new Error(`Security retention cursor missing for ${source}`)
  const idKeyed =
    source === 'oauth_events' ||
    source === 'oauth_native_mints' ||
    source === 'oauth_clients' ||
    source === 'copyright_rationales_erased' ||
    source === 'copyright_rationales_noncase'
  const keyset = idKeyed
    ? '($2::uuid IS NULL OR target.id > $2::uuid)'
    : `($2::timestamptz IS NULL OR (${plan.keyAt}, target.id) > ($2::timestamptz, $3::uuid))`
  const order = idKeyed ? 'target.id' : `${plan.keyAt}, target.id`
  // Every prepared-statement parameter must occur in its branch's SQL. Supplying the timestamp
  // cursor to an id-keyed page leaves $1/$2 untyped and PostgreSQL rejects the statement.
  const pageParameters: unknown[] = idKeyed
    ? [cutoffId, cursor.cursor_id, batchSize + 1]
    : [plan.cutoffAt, cursor.cursor_at, cursor.cursor_id, batchSize + 1]
  const limitParameter = idKeyed ? '$3::integer' : '$4::integer'
  const needsAccountLocks =
    source === 'copyright_rationales_noncase' ||
    source === 'oauth_events' ||
    source === 'oauth_native_mints'
  // Keep complete literal names visible while preserving each statement's exact SQL text.
  const pageBody = `
     SELECT target.id, (${plan.keyAt})::text AS key_at
     FROM ${plan.table} target
     WHERE ${plan.predicate} AND ${keyset}
     ORDER BY ${order} LIMIT ${limitParameter}
     ${needsAccountLocks ? '' : 'FOR UPDATE OF target SKIP LOCKED'}`
  const pageStatement =
    source === 'oauth_events'
      ? `/* listSecurityRetentionPage:oauth_events */${pageBody}`
      : source === 'oauth_native_mints'
        ? `/* listSecurityRetentionPage:oauth_native_mints */${pageBody}`
        : source === 'oauth_grants'
          ? `/* listSecurityRetentionPage:oauth_grants */${pageBody}`
          : source === 'oauth_grant_anchors'
            ? `/* listSecurityRetentionPage:oauth_grant_anchors */${pageBody}`
            : source === 'oauth_clients'
              ? `/* listSecurityRetentionPage:oauth_clients */${pageBody}`
              : source === 'api_keys_revoked'
                ? `/* listSecurityRetentionPage:api_keys_revoked */${pageBody}`
                : source === 'api_keys_expired'
                  ? `/* listSecurityRetentionPage:api_keys_expired */${pageBody}`
                  : source === 'facebook_friends'
                    ? `/* listSecurityRetentionPage:facebook_friends */${pageBody}`
                    : source === 'github_friends'
                      ? `/* listSecurityRetentionPage:github_friends */${pageBody}`
                      : source === 'x_friends'
                        ? `/* listSecurityRetentionPage:x_friends */${pageBody}`
                        : source === 'copyright_rationales_erased'
                          ? `/* listSecurityRetentionPage:copyright_rationales_erased */${pageBody}`
                          : `/* listSecurityRetentionPage:copyright_rationales_noncase */${pageBody}`
  const page = await query<{ id: string; key_at: string }>(pageStatement, pageParameters)
  const scanned = page.rows.slice(0, batchSize)
  let selected = scanned
  if (needsAccountLocks && scanned.length > 0) {
    const scannedIds = scanned.map(row => row.id)
    const lockedIds =
      source === 'copyright_rationales_noncase'
        ? await lockCopyrightRationaleRetentionPage(query, scannedIds)
        : await lockOAuthRetentionPageAccounts(
            query,
            source === 'oauth_events'
              ? 'oauth_authorization_server_events'
              : 'oauth_native_session_token_mints',
            scannedIds,
          )
    selected = scanned.filter(row => lockedIds.has(row.id))
  }
  if (source === 'oauth_events') {
    // The trigger accepts only old, nonessential events inside this transaction.
    await query(
      `/* authorizeOAuthEventRetention */ SELECT set_config('app.oauth_event_retention_cutoff', $1, true)`,
      [plan.cutoffAt.toISOString()],
    )
  }
  if (source === 'oauth_native_mints') {
    await query(
      `/* authorizeNativeMintRetention */ SELECT set_config('app.oauth_native_mint_retention_cutoff', $1, true)`,
      [plan.cutoffAt.toISOString()],
    )
  }
  if (source === 'copyright_rationales_erased' || source === 'copyright_rationales_noncase') {
    await query(
      `/* authorizeCopyrightRationaleRetention */ SELECT set_config('app.copyright_rationale_retention_cutoff', $1, true)`,
      [plan.cutoffAt.toISOString()],
    )
  }
  let deleted = 0
  if (selected.length > 0) {
    const deleteParameters: unknown[] = [selected.map(row => row.id)]
    if (plan.deletePredicateUsesCutoff) deleteParameters.push(plan.cutoffAt)
    const deleteBody = `
       DELETE FROM ${plan.table} target
       WHERE target.id = ANY($1::uuid[]) AND ${plan.deletePredicate ?? 'TRUE'}`
    const deleteStatement =
      source === 'oauth_events'
        ? `/* deleteSecurityRetentionPage:oauth_events */${deleteBody}`
        : source === 'oauth_native_mints'
          ? `/* deleteSecurityRetentionPage:oauth_native_mints */${deleteBody}`
          : source === 'oauth_grants'
            ? `/* deleteSecurityRetentionPage:oauth_grants */${deleteBody}`
            : source === 'oauth_grant_anchors'
              ? `/* deleteSecurityRetentionPage:oauth_grant_anchors */${deleteBody}`
              : source === 'oauth_clients'
                ? `/* deleteSecurityRetentionPage:oauth_clients */${deleteBody}`
                : source === 'api_keys_revoked'
                  ? `/* deleteSecurityRetentionPage:api_keys_revoked */${deleteBody}`
                  : source === 'api_keys_expired'
                    ? `/* deleteSecurityRetentionPage:api_keys_expired */${deleteBody}`
                    : source === 'facebook_friends'
                      ? `/* deleteSecurityRetentionPage:facebook_friends */${deleteBody}`
                      : source === 'github_friends'
                        ? `/* deleteSecurityRetentionPage:github_friends */${deleteBody}`
                        : source === 'x_friends'
                          ? `/* deleteSecurityRetentionPage:x_friends */${deleteBody}`
                          : source === 'copyright_rationales_erased'
                            ? `/* deleteSecurityRetentionPage:copyright_rationales_erased */${deleteBody}`
                            : `/* deleteSecurityRetentionPage:copyright_rationales_noncase */${deleteBody}`
    const result = await query(deleteStatement, deleteParameters)
    deleted = result.rowCount ?? 0
  }
  const hasMore = page.rows.length > batchSize
  const last = hasMore ? scanned.at(-1)! : null
  await query(
    `/* checkpointSecurityRetentionCursor */
     UPDATE security_retention_cleanup_cursors
     SET cursor_at = $2::timestamptz, cursor_id = $3::uuid
     WHERE source = $1::security_retention_sources`,
    [source, last?.key_at ?? null, last?.id ?? null],
  )
  return { deleted, hasMore }
}

/** Hold placement takes the same account advisory lock before inserting the hold. */
async function lockOAuthRetentionPageAccounts(
  query: TransactionQuery,
  table: 'oauth_authorization_server_events' | 'oauth_native_session_token_mints',
  ids: readonly string[],
): Promise<ReadonlySet<string>> {
  const accounts = await query<{ user_id: string }>(
    `/* listOAuthRetentionPageAccounts */
     SELECT DISTINCT user_id FROM ${table}
     WHERE id = ANY($1::uuid[]) AND user_id IS NOT NULL ORDER BY user_id`,
    [ids],
  )
  /* oxlint-disable no-await-in-loop -- advisory locks must follow one stable account order. */
  for (const account of accounts.rows) {
    // no-mistakes-disable-next-line query-reached-per-item: one sorted lock per distinct account in this bounded page
    await query(
      `/* lockOAuthRetentionPageAccount */
       SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`,
      [account.user_id],
    )
  }
  /* oxlint-enable no-await-in-loop */
  const locked = await query<{ id: string }>(
    `/* lockOAuthRetentionPageRows */
     SELECT id FROM ${table}
     WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE SKIP LOCKED`,
    [ids],
  )
  return new Set(locked.rows.map(row => row.id))
}
