import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import sql from 'sql-template-strings'

const BACKFILL_BATCH_SIZE = 100

export type IncompletePostClassifierApplication = {
  applicationId: string
  postId: string
  inputSha256: string
  configurationSha256: string
  detectorPackageVersion: string
}

type IncompleteApplicationRow = {
  id: string
  post_id: string
  input_sha256: Buffer
  configuration_sha256: Buffer
  detector_package_version: string
  completed_at: Date | null
  terminal_remote_failed_at: Date | null
  outcomes_persisted_at: Date | null
  superseded_at: Date | null
}

/** @public Recovery stream consumed by the dependent runtime in #982; excludes terminal failures. */
export async function* streamIncompletePostClassifierApplicationBatches(): AsyncGenerator<
  IncompletePostClassifierApplication[],
  void,
  unknown
> {
  yield* streamIncompletePostClassifierApplicationBatchesFromRows(
    createAsyncGeneratorFromCursor<IncompleteApplicationRow>(
      sql`/* streamIncompletePostClassifierApplicationBatches */
        SELECT id, post_id, input_sha256, configuration_sha256, detector_package_version,
          completed_at, terminal_remote_failed_at, outcomes_persisted_at, superseded_at
        FROM post_classifier_applications
        WHERE completed_at IS NULL
          AND superseded_at IS NULL
          AND NOT (terminal_remote_failed_at IS NOT NULL AND outcomes_persisted_at IS NULL)
        ORDER BY post_id, id
      `,
      { batchSize: BACKFILL_BATCH_SIZE },
    ),
  )
}

export async function* streamIncompletePostClassifierApplicationBatchesFromRows(
  rows: AsyncIterable<IncompleteApplicationRow>,
): AsyncGenerator<IncompletePostClassifierApplication[], void, unknown> {
  let batch: IncompletePostClassifierApplication[] = []
  for await (const row of rows) {
    if (
      row.completed_at !== null ||
      row.superseded_at !== null ||
      (row.terminal_remote_failed_at !== null && row.outcomes_persisted_at === null)
    ) {
      continue
    }
    if (!row.detector_package_version) {
      throw new Error('post classifier receipt is missing its detector package version')
    }
    batch.push({
      applicationId: row.id,
      postId: row.post_id,
      inputSha256: row.input_sha256.toString('hex'),
      configurationSha256: row.configuration_sha256.toString('hex'),
      detectorPackageVersion: row.detector_package_version,
    })
    if (batch.length >= BACKFILL_BATCH_SIZE) {
      yield batch
      batch = []
    }
  }
  if (batch.length > 0) yield batch
}
