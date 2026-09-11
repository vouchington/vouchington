import { beginTransaction, write } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { ExposureState, ModMediaRevealSurface } from './types.mts'
import { getExposureState } from './get.mts'

export interface RecordMediaRevealInput {
  postId?: string | null
  reportId?: string | null
  surface: ModMediaRevealSurface
  metadata?: Record<string, unknown>
}

export async function recordMediaReveal(
  moderatorId: string,
  input: RecordMediaRevealInput,
  options?: QueryOptions,
): Promise<void> {
  await write(
    sql`/* recordMediaReveal */
    INSERT INTO moderation_media_reveals (
      moderator_id,
      post_id,
      report_id,
      surface,
      metadata
    ) VALUES (
      ${moderatorId},
      ${input.postId ?? null},
      ${input.reportId ?? null},
      ${input.surface},
      ${JSON.stringify(input.metadata ?? {})}
    )`,
    options,
  )
}

export async function recordMediaRevealAndGetExposureState(
  moderatorId: string,
  input: RecordMediaRevealInput,
): Promise<ExposureState> {
  await using query = await beginTransaction()
  const options = { query }
  await lockAndRecordMediaReveal(query, moderatorId, input)
  const result = await getExposureState(moderatorId, options)
  await query.commit()
  return result
}

async function lockAndRecordMediaReveal(
  query: TransactionQuery,
  moderatorId: string,
  input: RecordMediaRevealInput,
): Promise<void> {
  const options = { query }
  await write(
    sql`/* recordMediaRevealAndGetExposureState:lockModerator */
      SELECT pg_advisory_xact_lock(hashtextextended(${moderatorId}, 0))
    `,
    options,
  )
  await recordMediaReveal(moderatorId, input, options)
}
