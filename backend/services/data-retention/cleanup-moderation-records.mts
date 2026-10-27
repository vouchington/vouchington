import { beginTransaction } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'
import { getModerationCleanupCandidates } from './cleanup-moderation-candidates.mts'
import { deleteExpiredModerationHistory } from './cleanup-moderation-delete-history.mts'
import { deleteExpiredModerationSanctions } from './cleanup-moderation-delete-sanctions.mts'
import { assertPositiveInteger } from './normalize-positive-integer.mts'
import { MODERATION_CLEANUP_KINDS } from '@voucha/types/entities/moderation-retention'
import type { ModerationCleanupKind } from './cleanup-moderation-kinds.mts'

export type ModerationRecordCleanupOptions = {
  kinds?: readonly ModerationCleanupKind[]
  batchSize: number
  maxBatches: number
  lowerBoundDate?: Date
  upperBoundDate?: Date
  now?: Date
}

export type ModerationRecordCleanupResult = {
  deleted: number
  hasMore: boolean
  remainingKinds: ModerationCleanupKind[]
}

/** Each stream owns a durable UUIDv7 position; one job processes at most its configured pages. */
export async function cleanupModerationRecords(
  options: ModerationRecordCleanupOptions,
): Promise<ModerationRecordCleanupResult> {
  const batchSize = assertPositiveInteger(options.batchSize, 'batchSize')
  const maxBatches = assertPositiveInteger(options.maxBatches, 'maxBatches')
  const now = options.now ?? new Date()
  let deleted = 0
  const remainingKinds: ModerationCleanupKind[] = []
  const kinds = MODERATION_CLEANUP_KINDS.filter(
    kind => !options.kinds || options.kinds.includes(kind),
  )
  for (const kind of kinds) {
    let kindHasMore = false
    for (let batch = 0; batch < maxBatches; batch += 1) {
      // no-mistakes-disable-next-line query-reached-per-item: fifteen fixed streams, with one bounded page transaction and durable checkpoint per step
      const result = await cleanupModerationRecordPage(kind, batchSize, now, options) // oxlint-disable-line no-await-in-loop -- each committed page checkpoints the next keyset position
      deleted += result.deleted
      kindHasMore = result.hasMore
      if (!result.hasMore) break
    }
    if (kindHasMore) remainingKinds.push(kind)
  }
  return { deleted, hasMore: remainingKinds.length > 0, remainingKinds }
}

async function cleanupModerationRecordPage(
  kind: ModerationCleanupKind,
  batchSize: number,
  now: Date,
  options: ModerationRecordCleanupOptions,
): Promise<{ deleted: number; hasMore: boolean }> {
  await using transaction = await beginTransaction()
  if (kind === 'actions') {
    // Hold placement/release writes this table, so its state cannot change during the delete page.
    await transaction(sql`/* cleanupModerationRecordPage.lockActionHolds */
      LOCK TABLE user_legal_preservation_holds IN SHARE MODE
    `)
  }
  await transaction(sql`/* cleanupModerationRecordPage.ensureCursor */
    INSERT INTO moderation_record_cleanup_cursors (kind)
    VALUES (${kind}::moderation_record_cleanup_kinds) ON CONFLICT DO NOTHING
  `)
  const { rows: progress } = await transaction<{
    cursor_record_id: string | null
    sweep_upper_bound_record_id: string | null
  }>(sql`/* cleanupModerationRecordPage.lockCursor */
    SELECT cursor_record_id, sweep_upper_bound_record_id FROM moderation_record_cleanup_cursors
    WHERE kind = ${kind}::moderation_record_cleanup_kinds FOR UPDATE
  `)
  const cursor = progress[0]
  if (!cursor) throw new Error(`Missing moderation retention cursor: ${kind}`)
  const productionUpperDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000)
  const upperDate =
    options.upperBoundDate && options.upperBoundDate < productionUpperDate
      ? options.upperBoundDate
      : productionUpperDate
  const upperId = cursor.sweep_upper_bound_record_id ?? getMinUUIDv7ForDate(upperDate)
  const lowerId = options.lowerBoundDate
    ? getMinUUIDv7ForDate(options.lowerBoundDate)
    : '00000000-0000-0000-0000-000000000000'
  const afterId =
    cursor.cursor_record_id && cursor.cursor_record_id > lowerId ? cursor.cursor_record_id : lowerId
  const candidates = await getModerationCleanupCandidates(
    kind,
    transaction,
    afterId,
    upperId,
    batchSize + 1,
  )
  const page = candidates.slice(0, batchSize)
  const deleted =
    kind === 'reports' ||
    kind === 'cases' ||
    kind === 'appeals' ||
    kind === 'disputes' ||
    kind === 'actions' ||
    kind === 'training_feedbacks' ||
    kind === 'judgements'
      ? await deleteExpiredModerationHistory(kind, transaction, page, now)
      : await deleteExpiredModerationSanctions(kind, transaction, page, now)
  const hasMore = candidates.length > batchSize
  await transaction(sql`/* cleanupModerationRecordPage.checkpoint */
    UPDATE moderation_record_cleanup_cursors
    SET cursor_record_id = ${hasMore ? page.at(-1)! : null}::uuid,
        sweep_upper_bound_record_id = ${hasMore ? upperId : null}::uuid
    WHERE kind = ${kind}::moderation_record_cleanup_kinds
  `)
  await transaction.commit()
  return { deleted, hasMore }
}
