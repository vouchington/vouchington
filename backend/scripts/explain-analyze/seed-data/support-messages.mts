import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'
import { assertSeededSupportAgentRuns } from './support-message-agent-runs.mts'
import { assertSeededSupportMessageCounts as assertSupportMessageCounts } from './support-message-counts.mts'

export const SUPPORT_MESSAGE_SEED_COUNT = 100_000
const SUPPORT_MESSAGE_DISTRACTOR_SEED_COUNT = 100_000
const SUPPORT_MESSAGE_TARGET_STRIDE = 1_000_000
const SUPPORT_MESSAGE_DISTRACTOR_CLUSTER_COUNT = SUPPORT_MESSAGE_DISTRACTOR_SEED_COUNT / 2
export const SUPPORT_MESSAGE_SEED = {
  contactId: seedUuid(0, '7b'),
  threadId: seedUuid(0, '7c'),
  oldestMessageId: targetMessageId(0),
  middleMessageId: targetMessageId(SUPPORT_MESSAGE_SEED_COUNT / 2),
  latestInboundMessageId: targetMessageId(SUPPORT_MESSAGE_SEED_COUNT - 2),
  distractorContactId: seedUuid(1, '7b'),
  distractorThreadId: seedUuid(1, '7c'),
  activeAutomaticRunId: seedUuid(0, '7e'),
  activeAutomaticRunIdempotencyKey: 'explain-support-messages-v3-active-automatic',
  activeAutomaticRunClaimToken: 'explain-support-messages-v3-active-automatic-claim',
  completedKeyedRunId: seedUuid(0, '7f'),
  completedKeyedRunIdempotencyKey: 'explain-support-messages-v3-completed-keyed',
  completedKeyedRunClaimToken: 'explain-support-messages-v3-finalize-claim',
} as const

export async function seedSupportMessages(): Promise<void> {
  console.log(
    `Seeding two ${SUPPORT_MESSAGE_SEED_COUNT.toLocaleString()}-message support threads with boundary-clustered distractors...`,
  )
  await using query = await beginTransaction()
  await query(
    `/* seedExplainData */ INSERT INTO support_contacts (id, email_address, name)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
    [SUPPORT_MESSAGE_SEED.contactId, 'explain-support-messages-v3@voucha.ai', 'EXPLAIN support'],
  )
  await query(
    `/* seedExplainData */ INSERT INTO support_threads (id, support_contact_id, subject)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
    [SUPPORT_MESSAGE_SEED.threadId, SUPPORT_MESSAGE_SEED.contactId, 'EXPLAIN support messages'],
  )
  await query(
    `/* seedExplainData */ INSERT INTO support_contacts (id, email_address, name)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
    [
      SUPPORT_MESSAGE_SEED.distractorContactId,
      'explain-support-messages-distractor-v3@voucha.ai',
      'EXPLAIN support distractor',
    ],
  )
  await query(
    `/* seedExplainData */ INSERT INTO support_threads (id, support_contact_id, subject)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
    [
      SUPPORT_MESSAGE_SEED.distractorThreadId,
      SUPPORT_MESSAGE_SEED.distractorContactId,
      'EXPLAIN support messages distractor',
    ],
  )
  await query(
    `/* seedExplainData */ DELETE FROM support_messages
       WHERE support_thread_id = $1
         AND NOT (
           (id >= $2::uuid AND id < $3::uuid)
           OR (id > $4::uuid AND id <= $5::uuid)
         )`,
    [
      SUPPORT_MESSAGE_SEED.distractorThreadId,
      supportMessageId(
        targetMessageSuffix(SUPPORT_MESSAGE_SEED_COUNT / 2) -
          SUPPORT_MESSAGE_DISTRACTOR_CLUSTER_COUNT,
      ),
      SUPPORT_MESSAGE_SEED.middleMessageId,
      SUPPORT_MESSAGE_SEED.latestInboundMessageId,
      supportMessageId(
        targetMessageSuffix(SUPPORT_MESSAGE_SEED_COUNT - 2) +
          SUPPORT_MESSAGE_DISTRACTOR_CLUSTER_COUNT,
      ),
    ],
  )
  await query(
    `/* seedExplainData */ INSERT INTO support_messages (
         id, support_thread_id, direction, body_text, body_html
       )
       SELECT
         ('019e0000-7d00-7000-8000-' || lpad(to_hex(message_index::bigint * 1000000), 12, '0'))::uuid,
         $1,
         CASE WHEN message_index % 2 = 0 THEN 'inbound' ELSE 'outbound' END::support_message_directions,
         '', '<p>x</p>'
       FROM generate_series(0, $2 - 1) AS message_index
       ON CONFLICT (id) DO UPDATE
       SET body_text = EXCLUDED.body_text, body_html = EXCLUDED.body_html
       WHERE support_messages.support_thread_id = EXCLUDED.support_thread_id
         AND (support_messages.body_text, support_messages.body_html)
             IS DISTINCT FROM (EXCLUDED.body_text, EXCLUDED.body_html)`,
    [SUPPORT_MESSAGE_SEED.threadId, SUPPORT_MESSAGE_SEED_COUNT],
  )
  await query(
    `/* seedExplainData */ INSERT INTO support_messages (
         id, support_thread_id, direction, body_text, body_html
       )
       SELECT
         ('019e0000-7d00-7000-8000-' || lpad(to_hex(
           CASE
             WHEN message_index < $3 THEN $4::bigint - $3::bigint + message_index
             ELSE $5::bigint + message_index - $3::bigint + 1
           END
         ), 12, '0'))::uuid,
         $1,
         CASE WHEN message_index % 2 = 0 THEN 'inbound' ELSE 'outbound' END::support_message_directions,
         '', '<p>x</p>'
       FROM generate_series(0, $2 - 1) AS message_index
       ON CONFLICT (id) DO UPDATE
       SET body_text = EXCLUDED.body_text, body_html = EXCLUDED.body_html
       WHERE support_messages.support_thread_id = EXCLUDED.support_thread_id
         AND (support_messages.body_text, support_messages.body_html)
             IS DISTINCT FROM (EXCLUDED.body_text, EXCLUDED.body_html)`,
    [
      SUPPORT_MESSAGE_SEED.distractorThreadId,
      SUPPORT_MESSAGE_DISTRACTOR_SEED_COUNT,
      SUPPORT_MESSAGE_DISTRACTOR_CLUSTER_COUNT,
      targetMessageSuffix(SUPPORT_MESSAGE_SEED_COUNT / 2),
      targetMessageSuffix(SUPPORT_MESSAGE_SEED_COUNT - 2),
    ],
  )
  await query(
    `/* seedExplainData */ INSERT INTO support_agent_runs (
         id, support_thread_id, support_message_id, idempotency_key, claim_token,
         model_name, model_provider, input
       ) VALUES ($1, $2, $3, $4, $5, 'gpt-5.4-nano', 'openai', $6::jsonb)
       ON CONFLICT DO NOTHING`,
    [
      SUPPORT_MESSAGE_SEED.activeAutomaticRunId,
      SUPPORT_MESSAGE_SEED.threadId,
      SUPPORT_MESSAGE_SEED.latestInboundMessageId,
      SUPPORT_MESSAGE_SEED.activeAutomaticRunIdempotencyKey,
      SUPPORT_MESSAGE_SEED.activeAutomaticRunClaimToken,
      JSON.stringify({ source: 'member_thread' }),
    ],
  )
  await query(
    `/* seedExplainData */ INSERT INTO support_agent_runs (
         id, support_thread_id, support_message_id, idempotency_key, claim_token,
         model_name, model_provider, input, output, termination_reason, completed_at
       ) VALUES ($1, $2, $3, $4, $5, 'gpt-5.4-nano', 'openai', $6::jsonb, $7::jsonb, 'no_tool_calls', CURRENT_TIMESTAMP)
       ON CONFLICT DO NOTHING`,
    [
      SUPPORT_MESSAGE_SEED.completedKeyedRunId,
      SUPPORT_MESSAGE_SEED.threadId,
      SUPPORT_MESSAGE_SEED.latestInboundMessageId,
      SUPPORT_MESSAGE_SEED.completedKeyedRunIdempotencyKey,
      SUPPORT_MESSAGE_SEED.completedKeyedRunClaimToken,
      JSON.stringify({ source: 'member_thread' }),
      JSON.stringify({ response: null, iterations: 0 }),
    ],
  )
  await query.commit()
  await assertSeededSupportMessageCounts()
  await assertSeededSupportAgentRuns(SUPPORT_MESSAGE_SEED)
}

function targetMessageId(logicalMessageIndex: number): string {
  return supportMessageId(targetMessageSuffix(logicalMessageIndex))
}

function targetMessageSuffix(logicalMessageIndex: number): number {
  return logicalMessageIndex * SUPPORT_MESSAGE_TARGET_STRIDE
}

function supportMessageId(suffix: number): string {
  return seedUuid(suffix, '7d')
}

export async function assertSeededSupportMessageCounts(): Promise<void> {
  await assertSupportMessageCounts({
    target: { threadId: SUPPORT_MESSAGE_SEED.threadId, count: SUPPORT_MESSAGE_SEED_COUNT },
    distractor: {
      threadId: SUPPORT_MESSAGE_SEED.distractorThreadId,
      count: SUPPORT_MESSAGE_DISTRACTOR_SEED_COUNT,
    },
  })
}
