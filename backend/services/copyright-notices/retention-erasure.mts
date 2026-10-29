import { beginTransaction, read } from '@data-stores/psql'
import { getMaxUUIDv7ForDate } from '@modules/utils'
import { shiftUtcCalendarMonths } from '@modules/utils/calendar-months'
import { observeSharedDbScope } from '@data-stores/psql/shared-db-scope-observer'
import { sharedDbIdsScope } from '@vouchington/postgres/query-telemetry'
import sql from 'sql-template-strings'
import {
  getCopyrightCaseRetentionMonths,
  getCopyrightRetentionWindows,
  isCopyrightEvidenceRetentionDeletionEnabled,
} from './config.mts'
import { planCopyrightRetentionPages } from './retention-erasure-budget.mts'
import { cleanupCopyrightErasedStorageObjects } from './retention-erased-storage-objects.mts'
import { sweepCopyrightEncryptionKeyOrphans } from './encryption-key-orphans.mts'
import { eraseCopyrightRetentionCase } from './retention-erasure-case.mts'

export type CopyrightRetentionSweepResult = {
  erased: number
  orphanKeysDestroyed: number
  orphanKeysFailed: number
  erasedObjectRegistriesDeleted: number
  ineligible: number
  progressed: number
  hasMore: boolean
  failed: { noticeId: string; reason: string }[]
}

const nothingDeleted = (): CopyrightRetentionSweepResult => ({
  erased: 0,
  orphanKeysDestroyed: 0,
  orphanKeysFailed: 0,
  erasedObjectRegistriesDeleted: 0,
  ineligible: 0,
  progressed: 0,
  hasMore: false,
  failed: [],
})

/** Error messages can contain object keys or references; expose only a class and short code. */
function failureReason(error: unknown): string {
  if (!(error instanceof Error)) return 'UnknownError'
  const code = (error as Error & { code?: unknown }).code
  return typeof code === 'string' && /^[\w.-]{1,64}$/.test(code)
    ? `${error.name}:${code}`
    : error.name
}

type CandidatePage = { ids: string[]; hasMore: boolean }

/** Limit raw UUIDv7 rows before looking up erasure state or evaluating any legal fact. */
async function selectCandidates(options: {
  cutoff: Date
  limit: number
  noticeIds?: readonly string[]
  family?: 'evidence' | 'evidence_work'
}): Promise<CandidatePage> {
  observeSharedDbScope(
    'selectCopyrightRetentionErasureCandidates',
    sharedDbIdsScope(options.noticeIds),
  )
  const family = options.family ?? 'evidence'
  const upperId = getMaxUUIDv7ForDate(new Date(options.cutoff.getTime() + 3 * 86_400_000))
  if (options.noticeIds) {
    if (options.noticeIds.length > options.limit)
      throw new RangeError('Scoped copyright erasure exceeds one page')
    const { rows } = await read<{
      id: string
    }>(sql`/* selectScopedCopyrightRetentionErasureCandidates */
      SELECT id FROM copyright_notices WHERE id = ANY(${[...options.noticeIds]}::uuid[])
        AND id <= ${upperId}::uuid ORDER BY id LIMIT ${options.limit}`)
    return { ids: rows.map(row => row.id), hasMore: false }
  }
  await using query = await beginTransaction()
  await query(sql`/* ensureCopyrightEvidenceRetentionCursor */
    INSERT INTO copyright_notice_minimal_purge_cursors (family, cursor_sweep_upper_bound)
    VALUES (${family}::copyright_minimal_purge_cursor_families, ${upperId}) ON CONFLICT DO NOTHING`)
  const { rows: cursors } = await query<{
    cursor_notice_id: string | null
    cursor_sweep_upper_bound: string | null
  }>(sql`
    /* lockCopyrightEvidenceRetentionCursor */
    SELECT cursor_notice_id, cursor_sweep_upper_bound FROM copyright_notice_minimal_purge_cursors
    WHERE family = ${family}::copyright_minimal_purge_cursor_families FOR UPDATE`)
  const cursor = cursors[0]
  if (!cursor) throw new Error('Copyright evidence retention cursor is missing')
  const sweepUpperId = cursor.cursor_sweep_upper_bound ?? upperId
  const candidates =
    family === 'evidence'
      ? sql`/* selectCopyrightRetentionErasureCandidates */ SELECT id FROM copyright_notices
      WHERE id <= ${sweepUpperId}::uuid AND (${cursor.cursor_notice_id}::uuid IS NULL OR id > ${cursor.cursor_notice_id}::uuid)
      ORDER BY id LIMIT ${options.limit + 1}`
      : sql`/* selectCopyrightRetentionErasureContinuationCandidates */
      SELECT copyright_notice_identity_id AS id FROM copyright_notice_minimal_purge_continuations
      WHERE copyright_notice_identity_id <= ${sweepUpperId}::uuid
        AND (${cursor.cursor_notice_id}::uuid IS NULL OR copyright_notice_identity_id > ${cursor.cursor_notice_id}::uuid)
      ORDER BY copyright_notice_identity_id LIMIT ${options.limit + 1}`
  const { rows } = await query<{ id: string }>(candidates)
  const page = rows.slice(0, options.limit)
  const hasMore = rows.length > options.limit
  await query(sql`/* checkpointCopyrightEvidenceRetentionCursor */
    UPDATE copyright_notice_minimal_purge_cursors
    SET cursor_notice_id = ${hasMore ? page.at(-1)?.id : null}::uuid,
      cursor_sweep_upper_bound = ${hasMore ? sweepUpperId : null}::uuid WHERE family = ${family}::copyright_minimal_purge_cursor_families`)
  await query.commit()
  return { ids: page.map(row => row.id), hasMore }
}

/** A one-case budget alternates durable families instead of silently starving continuations. */
async function nextSingleCaseFamily(): Promise<'evidence' | 'evidence_work'> {
  await using query = await beginTransaction()
  await query(sql`/* ensureCopyrightEvidenceFamilyTurn */ INSERT INTO copyright_notice_minimal_purge_cursors (family)
    VALUES ('evidence') ON CONFLICT DO NOTHING`)
  const { rows } = await query<{
    is_work_turn: boolean
  }>(sql`/* rotateCopyrightEvidenceFamilyTurn */
    UPDATE copyright_notice_minimal_purge_cursors SET is_work_turn = NOT is_work_turn WHERE family = 'evidence'
    RETURNING is_work_turn`)
  await query.commit()
  return rows[0]?.is_work_turn ? 'evidence_work' : 'evidence'
}

/** Raw case pages and finite per-case proofs make both reads and destruction bounded per run. */
export async function sweepCopyrightEvidenceRetention(
  options: { now?: Date; limit?: number; noticeIds?: readonly string[] } = {},
): Promise<CopyrightRetentionSweepResult> {
  if (!(await isCopyrightEvidenceRetentionDeletionEnabled())) return nothingDeleted()
  const windows = getCopyrightRetentionWindows()
  const retentionMonths = await getCopyrightCaseRetentionMonths()
  if (options.limit !== undefined && (!Number.isSafeInteger(options.limit) || options.limit < 1))
    throw new RangeError('Copyright retention needs a positive case cap')
  const plan = await planCopyrightRetentionPages(
    windows.proofMaxPages,
    Math.min(options.limit ?? windows.caseBatchSize, windows.caseBatchSize),
    retentionMonths !== null,
  )
  const orphanKeys = plan.keys
    ? await sweepCopyrightEncryptionKeyOrphans()
    : { destroyed: 0, failed: 0, hasMore: false }
  const erasedRegistries = plan.objects
    ? await cleanupCopyrightErasedStorageObjects(windows.proofPageSize)
    : { deleted: 0, hasMore: false }
  const independent = {
    orphanKeysDestroyed: orphanKeys.destroyed,
    orphanKeysFailed: orphanKeys.failed,
    erasedObjectRegistriesDeleted: erasedRegistries.deleted,
    hasMore: orphanKeys.hasMore || erasedRegistries.hasMore,
  }
  if (retentionMonths === null) return { ...nothingDeleted(), ...independent }
  const now = options.now ?? new Date()
  const cutoff = shiftUtcCalendarMonths(now, -retentionMonths)
  const limit = plan.cases
  if (limit === 0) return { ...nothingDeleted(), ...independent, hasMore: true }
  // Maintenance and at most `limit` case pages share the configured total work budget.
  // Each case advances one proof page (<=proofPageSize facts) OR one erasure page.
  const candidatePages = options.noticeIds
    ? [await selectCandidates({ cutoff, limit, noticeIds: options.noticeIds })]
    : limit === 1
      ? [await selectCandidates({ cutoff, limit, family: await nextSingleCaseFamily() })]
      : await Promise.all([
          selectCandidates({ cutoff, limit: Math.max(1, Math.floor(limit / 2)) }),
          selectCandidates({
            cutoff,
            limit: Math.max(1, limit - Math.floor(limit / 2)),
            family: 'evidence_work',
          }),
        ])
  const candidates = {
    ids: [...new Set(candidatePages.flatMap(page => page.ids))].slice(0, limit),
    hasMore: candidatePages.some(page => page.hasMore),
  }
  const result = { ...nothingDeleted(), ...independent }
  result.hasMore ||= candidates.hasMore
  for (const noticeId of candidates.ids) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- each bounded case owns its locks and commit.
      const outcome = await eraseCopyrightRetentionCase(noticeId)
      if (outcome === 'erased') result.erased++
      else if (outcome === 'progress') result.progressed++
      else result.ineligible++
    } catch (err) {
      result.failed.push({ noticeId, reason: failureReason(err) })
    }
  }
  result.hasMore ||= result.progressed > 0 || result.failed.length > 0
  return result
}
