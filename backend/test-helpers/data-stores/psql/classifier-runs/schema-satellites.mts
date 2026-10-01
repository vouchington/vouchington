import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Raw `classifier_run_requests` rows and C5 local outcomes for schema tests. */
export async function insertClassifierRunRequestForSchemaTest(input: {
  classifierId: string
  postId?: string | null
  rssFeedItemId?: string | null
  inputSha256?: Buffer
  runId?: string | null
  noWorkAt?: Date | null
  staleAt?: Date | null
}): Promise<string> {
  const orNull = <T,>(value: T | null | undefined): T | null => (value === undefined ? null : value)
  const { rows } = await write<{ id: string }>(sql`/* insertClassifierRunRequestForSchemaTest */
    INSERT INTO classifier_run_requests (
      classifier_id, post_id, rss_feed_item_id, input_sha256, run_id, no_work_at, stale_at
    ) VALUES (
      ${input.classifierId}, ${orNull(input.postId)}, ${orNull(input.rssFeedItemId)},
      ${input.inputSha256 ?? Buffer.alloc(32, 1)}, ${orNull(input.runId)},
      ${orNull(input.noWorkAt)}, ${orNull(input.staleAt)}
    ) RETURNING id
  `)
  return rows[0]!.id
}

export async function readClassifierRunRequestForSchemaTest(id: string) {
  const { rows } = await read<{
    run_id: string | null
    no_work_at: Date | null
    stale_at: Date | null
  }>(sql`/* readClassifierRunRequestForSchemaTest */
    SELECT run_id, no_work_at, stale_at FROM classifier_run_requests WHERE id = ${id}
  `)
  return rows[0]
}

export function settleClassifierRunRequestForSchemaTest(
  id: string,
  settlement: { noWorkAt?: Date; staleAt?: Date },
) {
  return write(sql`/* settleClassifierRunRequestForSchemaTest */
    UPDATE classifier_run_requests
    SET no_work_at = ${settlement.noWorkAt ?? null}, stale_at = ${settlement.staleAt ?? null}
    WHERE id = ${id}
  `)
}

export function insertPostClassifierLocalOutcomeForSchemaTest(
  runId: string,
  topicId: string,
  confidenceScore = 0.5,
) {
  return write(sql`/* insertPostClassifierLocalOutcomeForSchemaTest */
    INSERT INTO post_classifier_local_outcomes (
      run_id, local_topic_id, flagged, reason, confidence_score, confidence_threshold,
      classification, detector, detector_model_version
    ) VALUES (
      ${runId}, ${topicId}, TRUE, 'looks generated', ${confidenceScore}, 0.5, 'ai',
      'test-detector', 'test-detector-1'
    )
  `)
}

export function revisePostClassifierLocalOutcomeForSchemaTest(runId: string) {
  return write(sql`/* revisePostClassifierLocalOutcomeForSchemaTest */
    UPDATE post_classifier_local_outcomes SET flagged = FALSE WHERE run_id = ${runId}
  `)
}

export function deletePostForSchemaTest(postId: string) {
  return write(sql`/* deletePostForSchemaTest */ DELETE FROM posts WHERE id = ${postId}`)
}

export function deleteClassifierRunForSchemaTest(runId: string) {
  return write(sql`/* deleteClassifierRunForSchemaTest */
    DELETE FROM classifier_runs WHERE id = ${runId}
  `)
}

/** Raw `classifier_run_candidates` rows, to prove the constraints without the lifecycle service. */
export function insertClassifierRunCandidateForSchemaTest(
  runId: string,
  topicId: string,
  ordinal: number,
) {
  return write(sql`/* insertClassifierRunCandidateForSchemaTest */
    INSERT INTO classifier_run_candidates (run_id, topic_id, ordinal)
    VALUES (${runId}, ${topicId}, ${ordinal})
  `)
}

export function reviseClassifierRunCandidateForSchemaTest(
  runId: string,
  topicId: string,
  ordinal: number,
) {
  return write(sql`/* reviseClassifierRunCandidateForSchemaTest */
    UPDATE classifier_run_candidates SET ordinal = ${ordinal}
    WHERE run_id = ${runId} AND topic_id = ${topicId}
  `)
}

export async function readClassifierRunCandidateOrdinalsForSchemaTest(runId: string) {
  const { rows } = await read<{ topic_id: string; ordinal: number }>(sql`
    /* readClassifierRunCandidateOrdinalsForSchemaTest */
    SELECT topic_id, ordinal FROM classifier_run_candidates WHERE run_id = ${runId} ORDER BY ordinal
  `)
  return rows.map(row => ({ topicId: row.topic_id, ordinal: row.ordinal }))
}

export function deleteTopicForSchemaTest(topicId: string) {
  return write(sql`/* deleteTopicForSchemaTest */ DELETE FROM topics WHERE id = ${topicId}`)
}
