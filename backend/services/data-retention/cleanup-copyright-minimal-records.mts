import { beginTransaction, read } from '@data-stores/psql'
import { getMaxUUIDv7ForDate } from '@modules/utils'
import { purgeCopyrightMinimalRecord } from '@services/copyright-notices'
import sql from 'sql-template-strings'
import { getCopyrightMinimalPurgeLimits, type DataRetentionLimits } from './config.mts'

const DAY_MS = 24 * 60 * 60 * 1000
type Family = 'work' | 'new' | 'identity'
type CandidatePage = { ids: string[]; hasMore: boolean }

function threeCalendarYearsBefore(now: Date): Date {
  const year = now.getUTCFullYear() - 3
  const month = now.getUTCMonth()
  const day = Math.min(now.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate())
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
      now.getUTCMilliseconds(),
    ),
  )
}

/** Advance even past ineligible IDs; the NULL wrap retries them on a later run. */
async function selectCandidatePage(
  family: Family,
  limit: number,
  upperId: string,
  noticeIds?: readonly string[],
): Promise<CandidatePage> {
  if (noticeIds) {
    if (noticeIds.length > limit) throw new RangeError('Scoped copyright purge exceeds one page')
    if (noticeIds.length === 0) return { ids: [], hasMore: false }
    const { rows } =
      family === 'work'
        ? await read<{ id: string }>(sql`/* scopedCopyrightMinimalPurgeWork */
        SELECT copyright_notice_identity_id AS id FROM copyright_notice_minimal_purge_continuations
        WHERE copyright_notice_identity_id = ANY(${[...noticeIds]}::uuid[])
        ORDER BY copyright_notice_identity_id LIMIT ${limit + 1}`)
        : family === 'identity'
          ? await read<{ id: string }>(sql`/* scopedCopyrightRetainedCaseIdentities */
          SELECT identity.id FROM copyright_notice_retained_identities identity
          WHERE identity.id = ANY(${[...noticeIds]}::uuid[])
          ORDER BY identity.id LIMIT ${limit + 1}`)
          : await read<{ id: string }>(sql`/* scopedCopyrightMinimalPurgeCases */
        SELECT id FROM copyright_notices
        WHERE id = ANY(${[...noticeIds]}::uuid[]) AND id <= ${upperId}::uuid
        ORDER BY id LIMIT ${limit + 1}`)
    return { ids: rows.slice(0, limit).map(row => row.id), hasMore: rows.length > limit }
  }
  await using query = await beginTransaction()
  await query(sql`/* ensureCopyrightMinimalPurgeCursor */
    INSERT INTO copyright_notice_minimal_purge_cursors (family)
    VALUES (${family}::copyright_minimal_purge_cursor_families) ON CONFLICT DO NOTHING`)
  const { rows: cursor } = await query<{ cursor_notice_id: string | null }>(sql`
    /* lockCopyrightMinimalPurgeCursor */
    SELECT cursor_notice_id FROM copyright_notice_minimal_purge_cursors
    WHERE family = ${family}::copyright_minimal_purge_cursor_families FOR UPDATE`)
  const after = cursor[0]?.cursor_notice_id ?? null
  const { rows } =
    family === 'work'
      ? await query<{ id: string }>(sql`/* listCopyrightMinimalPurgeWorkPage */
      SELECT copyright_notice_identity_id AS id FROM copyright_notice_minimal_purge_continuations
      WHERE (${after}::uuid IS NULL OR copyright_notice_identity_id > ${after}::uuid)
      ORDER BY copyright_notice_identity_id LIMIT ${limit + 1}`)
      : family === 'identity'
        ? await query<{ id: string }>(sql`/* listCopyrightRetainedCaseIdentityPage */
        SELECT identity.id FROM copyright_notice_retained_identities identity
        WHERE (${after}::uuid IS NULL OR identity.id > ${after}::uuid)
        ORDER BY identity.id LIMIT ${limit + 1}`)
        : await query<{ id: string }>(sql`/* listCopyrightMinimalPurgeNewPage */
      SELECT id FROM copyright_notices
      WHERE id <= ${upperId}::uuid AND (${after}::uuid IS NULL OR id > ${after}::uuid)
      ORDER BY id LIMIT ${limit + 1}`)
  const ids = rows.slice(0, limit).map(row => row.id)
  const hasMore = rows.length > limit
  await query(sql`/* checkpointCopyrightMinimalPurgeCursor */
    UPDATE copyright_notice_minimal_purge_cursors
    SET cursor_notice_id = ${hasMore ? ids.at(-1) : null}::uuid
    WHERE family = ${family}::copyright_minimal_purge_cursor_families`)
  await query.commit()
  return { ids, hasMore }
}

export type CopyrightMinimalPurgeSweepResult = {
  purged: number
  progressed: number
  ineligible: number
  retainedIdentitiesDeleted: number
  hasMore: boolean
  failed: { noticeId: string; reason: string }[]
}

/** Select at most two index-backed case pages; each selected case has a capped child budget. */
export async function cleanupCopyrightMinimalRecords(
  limits: DataRetentionLimits,
  options: { now?: Date; noticeIds?: readonly string[] } = {},
): Promise<CopyrightMinimalPurgeSweepResult> {
  const now = options.now ?? new Date()
  const cutoff = threeCalendarYearsBefore(now)
  // The one-day-wider UUID bound includes leap-day anniversaries; SQL decides exact eligibility.
  const upperId = getMaxUUIDv7ForDate(new Date(cutoff.getTime() + DAY_MS))
  const configured = getCopyrightMinimalPurgeLimits()
  const caseLimit = Math.min(limits.batchSize, configured.caseBatchSize)
  const pageSize = Math.min(limits.batchSize, configured.pageSize)
  const pageBudget = Math.min(limits.maxBatches, configured.maxPagesPerCase)
  if (caseLimit < 1 || pageSize < 1 || pageBudget < 1)
    throw new RangeError('Copyright purge needs positive retention limits')
  const [work, fresh, identities] = await Promise.all([
    selectCandidatePage('work', caseLimit, upperId, options.noticeIds),
    selectCandidatePage('new', caseLimit, upperId, options.noticeIds),
    selectCandidatePage('identity', caseLimit, upperId, options.noticeIds),
  ])
  const result: CopyrightMinimalPurgeSweepResult = {
    purged: 0,
    progressed: 0,
    ineligible: 0,
    retainedIdentitiesDeleted: 0,
    hasMore: work.hasMore || fresh.hasMore || identities.hasMore,
    failed: [],
  }
  // oxlint-disable no-await-in-loop -- each selected case commits capped pages independently.
  for (const noticeId of new Set([...work.ids, ...fresh.ids])) {
    try {
      // no-mistakes-disable-next-line query-reached-per-item: the case selection and per-case page budgets are both capped; each case takes its own legal-hold lock.
      const outcome = await purgeCopyrightMinimalRecord(noticeId, {
        now,
        cutoff,
        pageSize,
        maxBatches: pageBudget,
      })
      if (outcome === 'purged') result.purged++
      else if (outcome === 'more') result.progressed++
      else result.ineligible++
    } catch (err) {
      result.failed.push({ noticeId, reason: err instanceof Error ? err.name : 'UnknownError' })
    }
  }
  // oxlint-enable no-await-in-loop
  // oxlint-disable no-await-in-loop -- each capped orphan identity has one guarded transaction.
  for (const noticeId of identities.ids) {
    try {
      await using query = await beginTransaction()
      // no-mistakes-disable-next-line query-reached-per-item: at most one scoped orphan identity is checked per selected candidate.
      await query(sql`/* scopeCopyrightOrphanIdentityCleanup */
        SELECT set_config('app.copyright_minimal_purge_notice_id', ${noticeId}, true)`)
      // no-mistakes-disable-next-line query-reached-per-item: each capped orphan candidate requires its own guarded FK-safe deletion transaction.
      const deleted = await query(sql`/* deleteOrphanCopyrightRetainedCaseIdentity */
        DELETE FROM copyright_notice_retained_identities identity WHERE identity.id = ${noticeId}
          AND NOT EXISTS (SELECT 1 FROM copyright_notices notice WHERE notice.id = identity.id)
          AND NOT EXISTS (SELECT 1 FROM copyright_notice_minimal_purge_continuations work
            WHERE work.copyright_notice_identity_id = identity.id)
          AND NOT EXISTS (SELECT 1 FROM copyright_notice_retained_parties party
            WHERE party.copyright_notice_identity_id = identity.id)
          AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_reviews review
            WHERE review.promoted_copyright_notice_identity_id = identity.id)`)
      await query.commit()
      result.retainedIdentitiesDeleted += deleted.rowCount ?? 0
    } catch (err) {
      result.failed.push({ noticeId, reason: err instanceof Error ? err.name : 'UnknownError' })
    }
  }
  // oxlint-enable no-await-in-loop
  return result
}
