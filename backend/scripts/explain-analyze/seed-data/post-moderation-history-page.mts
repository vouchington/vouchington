import { write } from '@data-stores/psql'
import { postSeedTimestampMs, seedUuid, seedUuidAtTimestamp } from './common.mts'

/** A long live history distinguishes top-ten walks from ranking every visible result. */
export async function seedPostModerationHistoryPage(postId: string): Promise<void> {
  await write(
    `/* seedPostModerationHistoryParent */
    INSERT INTO posts (id, created_by_id, post_type, title, markdown, created_via,
      bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
    VALUES ($1::uuid, $2::uuid, 'discussion', 'Moderation history plan', 'Moderation history plan',
      'system', decode(repeat('00', 32), 'hex'), decode(repeat('00', 32), 'hex'))
    ON CONFLICT (id) DO NOTHING`,
    [postId, seedUuid(0, '01')],
  )
  const historyIds = Array.from({ length: 1_000 }, (_, index) =>
    seedUuidAtTimestamp(postSeedTimestampMs(0) - 95 * 24 * 60 * 60 * 1_000, 2_500_000 + index),
  )
  await write(
    `/* seedPostModerationHistoryPage */
    INSERT INTO agent_moderations (id, post_id, input_sha256, prompt_id, agent_id, results, is_flagged)
    SELECT id, $2::uuid, decode(lpad(to_hex(ordinal + 100000), 64, '0'), 'hex'),
      $3::uuid, $4::uuid, '{}'::jsonb, FALSE
    FROM unnest($1::uuid[]) WITH ORDINALITY AS history(id, ordinal)
    ON CONFLICT (post_id, input_sha256, prompt_id) DO NOTHING`,
    [historyIds, postId, seedUuid(2_000_000, '35'), seedUuid(2_000_000, '36')],
  )
  await write('/* analyzePostModerationHistoryPage */ ANALYZE agent_moderations, moderator_agents')
}
