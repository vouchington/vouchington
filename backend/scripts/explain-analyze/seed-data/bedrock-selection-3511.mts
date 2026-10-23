import { write } from '@data-stores/psql'
import { resolveSeedAnchor } from './seed-anchor.mts'

/** Most active batch jobs are recent; a small stale tail exercises the due predicate. */
export async function seedBedrockSelection3511(): Promise<void> {
  const { dayAnchorMs } = resolveSeedAnchor(process.env.EXPLAIN_SEED_ANCHOR_DATE)
  console.log('Seeding 10000 active Bedrock batch jobs for stale selection...')
  await write(
    `/* seedBedrockSelection3511 */
    INSERT INTO bedrock_embedding_batches
      (id, model_id, job_type, job_arn, submitted_at, in_progress_at)
    SELECT ('019e0000-9300-7000-8000-' || lpad(to_hex(ordinal), 12, '0'))::uuid,
      'fixture-bedrock-model', 'posts', 'fixture-bedrock-job-' || ordinal,
      $1::timestamptz - INTERVAL '3 days',
      CASE WHEN ordinal % 100 = 0 THEN $1::timestamptz - INTERVAL '2 days'
        ELSE $1::timestamptz - INTERVAL '1 hour' END
    FROM generate_series(1, 10000) ordinal
    ON CONFLICT (id) DO UPDATE SET
      submitted_at = EXCLUDED.submitted_at, in_progress_at = EXCLUDED.in_progress_at`,
    [new Date(dayAnchorMs)],
  )

  // Separate, unapproved posts keep other feed scenarios unchanged. Almost all
  // embeddings are current, so the mismatch page must seek sparse candidates.
  console.log('Seeding 10000 posts with sparse embedding mismatches...')
  await write(`/* seedBedrockSelection3511:sparseMismatch */
    INSERT INTO posts
      (id, created_via, post_type, title, markdown, created_by_id,
       bedrock_nova_multimodal_v1_content_sha256,
       bedrock_nova_multimodal_v1_input_sha256, llm_moderation_content_sha256)
    SELECT ('01b00000-a000-7000-8000-' || lpad(to_hex(ordinal), 12, '0'))::uuid,
      'system', 'discussion', 'Synthetic embedding candidate ' || ordinal,
      'Synthetic embedding candidate',
      (SELECT id FROM users ORDER BY id LIMIT 1),
      decode(lpad(to_hex(ordinal), 64, '0'), 'hex'),
      CASE WHEN ordinal % 100 = 0 THEN NULL
        ELSE decode(lpad(to_hex(ordinal), 64, '0'), 'hex') END,
      decode(lpad(to_hex(ordinal), 64, '0'), 'hex')
    FROM generate_series(1, 10000) ordinal ON CONFLICT DO NOTHING`)
}
