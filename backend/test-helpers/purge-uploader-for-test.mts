import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import type { PrivateUser } from '@voucha/types/entities/user'
import { getRetentionCutoffDate } from '../services/data-retention/cleanup-options.mts'
import { cleanupSoftDeletedUser } from '../services/data-retention/cleanup-soft-deleted-user.mts'
import { deleteUser } from '../services/users/delete.mts'
import { drainUserDeletionForTest } from './services/users/delete-test-support.mts'

const DAY_MS = 24 * 60 * 60 * 1000

type UploaderPurgeClock = {
  deleted_at: Date | null
  completed_at: Date | null
  last_lifecycle_at: Date
  work_count: number
}

/** Exercises production deletion and final retention cleanup for one isolated uploader/image. */
export async function purgeUploaderForTest(user: PrivateUser, imageId: string): Promise<void> {
  const attempt = await deleteUser(user, user, { purgeCacheTags: async () => undefined })
  await drainUserDeletionForTest(attempt)

  // Read the actual committed lifecycle on the primary; never backdate deletion to qualify it.
  // Two cache-tag receipts belong to this fixture. Read one extra to reject fixture growth.
  const { rows } = await write<UploaderPurgeClock>(
    `/* purgeUploaderForTest:clock */
    SELECT account.deleted_at, request.completed_at, works.work_count,
      GREATEST(uuid_extract_timestamp(account.id), uuid_extract_timestamp(request.id),
        uuid_extract_timestamp(image.id), account.created_at, account.updated_at, account.deleted_at,
        request.created_at, request.updated_at, request.queued_at, request.dispatched_at,
        request.processing_started_at, request.completed_at,
        uuid_extract_timestamp(request.processing_attempt_id),
        image.created_at, image.updated_at, image.upload_staged_at, image.upload_started_at,
        image.upload_completed_at, image.upload_failed_at, image.upload_source_deleted_at,
        works.last_work_at) AS last_lifecycle_at
    FROM users account
    JOIN user_deletion_requests request ON request.user_id = account.id AND request.id = $2
    JOIN images image ON image.created_by_id = account.id AND image.id = $3
    CROSS JOIN LATERAL (
      SELECT count(*)::integer AS work_count,
        max(GREATEST(uuid_extract_timestamp(work.id), work.created_at, work.updated_at,
          work.requested_at, work.completed_at))
          AS last_work_at
      FROM (
        SELECT id, created_at, updated_at, requested_at, completed_at
        FROM user_deletion_external_works
        WHERE request_id = request.id
        ORDER BY id
        LIMIT 3
      ) work
    ) works
    WHERE account.id = $1
  `,
    [user.id, attempt.requestId, imageId],
  )
  const clock = rows[0]
  assert(clock, 'Owned uploader, image and deletion request must survive until final purge')
  assert(clock.deleted_at instanceof Date, 'Production privacy fence must mark deletion')
  assert(clock.completed_at instanceof Date, 'Production deletion must complete before purge')
  assert(clock.last_lifecycle_at instanceof Date)
  assert.equal(clock.work_count, 2, 'Expected the owned id and username cache-tag receipts')

  // Advance injected business time beyond every owned persisted lifecycle timestamp. The real
  // 90-day user retention window has elapsed; all database timestamps remain untouched.
  const now = new Date(clock.last_lifecycle_at.getTime() + 400 * DAY_MS)
  const cutoffDate = getRetentionCutoffDate(90, now)
  const result = await cleanupSoftDeletedUser(user.id, cutoffDate, clock.deleted_at, 1, {
    remainingRows: 1,
  })
  assert.deepEqual(result, { deleted: 1, hasMore: false })
}
