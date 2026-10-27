import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import { background } from '@queues/background/queues'
import { OPENAI_MODERATION_RECONCILE_IMAGE_QUARANTINES_JOB } from '@queues/background/enqueues/openai-moderation-jobs'
import {
  listPendingImageQuarantinePage,
  reconcilePendingImageQuarantines,
} from '@services/openai-moderation'
import { getOpenaiModerationWorkLimit } from '@services/openai-moderation/work-limits'
import { handleOpenAIModerationOmniSingleJob } from '@workers/openai-moderation/processors/openai-moderation-omni-single'

/** Global selection is witnessed only in this job-owned database; no nonempty page reaches S3. */
export async function runImageQuarantineScenarios(): Promise<void> {
  console.log('Running: image-quarantine-global-selection')
  const existing = await write(
    `/* imageQuarantineNativeWitness */ SELECT 1 FROM images
      WHERE quarantine_pending_at IS NOT NULL AND deleted_at IS NULL LIMIT 1`,
  )
  assert.equal(existing.rows.length, 0, 'Native image quarantine witness requires no pending work')
  assert.deepEqual(await listPendingImageQuarantinePage(), [])
  assert.deepEqual(await reconcilePendingImageQuarantines(), { reconciled: 0 })
  const definition = OPENAI_MODERATION_RECONCILE_IMAGE_QUARANTINES_JOB
  const job = await background.add(definition.name, {}, definition.options)
  assert.ok(job)
  try {
    assert.deepEqual(
      await handleOpenAIModerationOmniSingleJob(
        job as Parameters<typeof handleOpenAIModerationOmniSingleJob>[0],
      ),
      { reconciled: 0 },
    )
  } finally {
    await job.remove()
  }

  const limit = getOpenaiModerationWorkLimit('image_quarantine_batch_size')
  const fixtures = await seedPendingImages(limit)
  try {
    const expected = fixtures
      .filter(row => row.pending_at !== null && !row.deleted)
      .toSorted(
        (a, b) => a.pending_at!.getTime() - b.pending_at!.getTime() || a.id.localeCompare(b.id),
      )
      .slice(0, limit)
      .map(({ id }) => ({ id }))
    assert.equal(expected.length, limit)
    assert.deepEqual(await listPendingImageQuarantinePage(), expected)
  } finally {
    await write(
      `/* imageQuarantineNativeWitness */ DELETE FROM images WHERE id = ANY($1::uuid[])`,
      [fixtures.map(row => row.id)],
    )
  }
}

type SeededImage = { id: string; pending_at: Date | null; deleted: boolean }

async function seedPendingImages(limit: number): Promise<SeededImage[]> {
  await using query = await beginTransaction()
  // B+1 eligible rows demonstrate the actual configured limit; the public config caps B at 1000.
  const { rows } = await query<SeededImage>(
    `/* imageQuarantineNativeWitness */ WITH input AS MATERIALIZED (
      SELECT uuidv7(INTERVAL '-1 day') AS id, ordinal,
        CASE WHEN ordinal <= $1 + 1 THEN
          CASE WHEN ordinal % 2 = 0 THEN CURRENT_TIMESTAMP - INTERVAL '2 hours'
            ELSE CURRENT_TIMESTAMP - INTERVAL '1 hour' END
          WHEN ordinal = $1 + 2 THEN CURRENT_TIMESTAMP - INTERVAL '2 hours' END AS pending_at
      FROM generate_series(1, $1::integer + 3) AS ordinal
    ), inserted AS (
      INSERT INTO images (id, created_by_id, data, s3_key, quarantine_pending_at, deleted_at)
      SELECT id, (SELECT id FROM users WHERE username = 'system'), '{}'::jsonb, id::text,
        pending_at, CASE WHEN ordinal = $1 + 2 THEN clock_timestamp() END
      FROM input RETURNING id, quarantine_pending_at AS pending_at, deleted_at IS NOT NULL AS deleted
    ) SELECT * FROM inserted`,
    [limit],
  )
  await query.commit()
  return rows
}
