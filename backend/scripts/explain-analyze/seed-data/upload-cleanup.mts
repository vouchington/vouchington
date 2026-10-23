import { beginTransaction, read, write } from '@data-stores/psql'

import {
  UPLOAD_CLEANUP_NOISE_ROWS,
  UPLOAD_CLEANUP_ELIGIBLE_ROWS,
  UPLOAD_CLEANUP_TOTAL_ROWS,
  UPLOAD_CLEANUP_MARKER_TIME,
  UPLOAD_CLEANUP_ELIGIBLE_TIME,
  UPLOAD_CLEANUP_ACTOR_ID,
  uploadCleanupSeedId,
} from './upload-cleanup-cohort.mts'

const BATCH_SIZE = 500

/**
 * Pending rows surround the sparse staged/recovery work. Completed/immutable rows preserve
 * non-mutating retry heads; the abandonment predicate has a large due pending population.
 * This is an EXPLAIN benchmark, not an external-provider failure simulation.
 */
export async function seedUploadCleanup(): Promise<void> {
  await write(
    `/* seedUploadCleanup:actor */
    INSERT INTO users (id, username) VALUES ($1, 'seed-upload-cleanup-actor')
    ON CONFLICT (id) DO NOTHING`,
    [UPLOAD_CLEANUP_ACTOR_ID],
  )
  for (let start = 0; start < UPLOAD_CLEANUP_TOTAL_ROWS; start += BATCH_SIZE) {
    const ids: string[] = []
    const timestamps: string[] = []
    const states: string[] = []
    for (
      let index = start;
      index < Math.min(start + BATCH_SIZE, UPLOAD_CLEANUP_TOTAL_ROWS);
      index++
    ) {
      ids.push(uploadCleanupSeedId(index))
      if (index < UPLOAD_CLEANUP_NOISE_ROWS) {
        states.push('pending')
        timestamps.push(
          index < UPLOAD_CLEANUP_NOISE_ROWS / 2
            ? '2026-07-01T00:00:00.000000Z'
            : '2026-07-01T04:00:00.000000Z',
        )
      } else if (index < UPLOAD_CLEANUP_TOTAL_ROWS - 3) {
        states.push(
          index < UPLOAD_CLEANUP_NOISE_ROWS + UPLOAD_CLEANUP_ELIGIBLE_ROWS
            ? 'completed'
            : 'immutable',
        )
        timestamps.push(UPLOAD_CLEANUP_ELIGIBLE_TIME)
      } else {
        states.push(['completed', 'immutable', 'pending'][index - (UPLOAD_CLEANUP_TOTAL_ROWS - 3)]!)
        timestamps.push(UPLOAD_CLEANUP_MARKER_TIME)
      }
    }
    await using transaction = await beginTransaction()
    // no-mistakes-disable-next-line query-reached-per-item: finite deterministic fixture population is inserted in bounded 500-row transaction batches
    await transaction(
      `/* seedUploadCleanup:images */
      INSERT INTO images (id, created_by_id, data, s3_key, sha_256,
        upload_staged_at, upload_started_at, upload_completed_at)
      SELECT id, $4::uuid, '{}'::jsonb,
        CASE WHEN state = 'pending' THEN id::text ELSE repeat(replace(id::text, '-', ''), 2) END,
        CASE WHEN state = 'pending' THEN NULL ELSE decode(repeat(replace(id::text, '-', ''), 2), 'hex') END,
        staged_at,
        CASE WHEN state = 'pending' THEN NULL ELSE staged_at END,
        CASE WHEN state = 'completed' THEN staged_at ELSE NULL END
      FROM unnest($1::uuid[], $2::timestamptz[], $3::text[]) seed(id, staged_at, state)
      ORDER BY id ON CONFLICT (id) DO NOTHING`,
      [ids, timestamps, states, UPLOAD_CLEANUP_ACTOR_ID],
    )
    await transaction.commit()
  }
}

export async function assertUploadCleanupPopulation(): Promise<void> {
  const { rows } = await read<{ count: string }>(
    `/* assertUploadCleanupPopulation */
    SELECT count(*)::text AS count FROM (
      SELECT id FROM images WHERE created_by_id = $1
      ORDER BY id LIMIT $2
    ) owned`,
    [UPLOAD_CLEANUP_ACTOR_ID, UPLOAD_CLEANUP_TOTAL_ROWS + 1],
  )
  if (Number(rows[0]?.count) !== UPLOAD_CLEANUP_TOTAL_ROWS)
    throw new Error('Upload cleanup EXPLAIN seed is missing or has an unexpected cardinality')
}
