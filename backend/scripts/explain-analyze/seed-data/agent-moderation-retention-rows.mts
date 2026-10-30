import { write } from '@data-stores/psql'
import { seedUuid, seedUuidAtTimestamp } from './common.mts'

const BATCH_SIZE = 2_000

export type AgentModerationRetentionRow = {
  id: string
  postId: string
  promptId: string
  agentId: string
  inputVersion: number
  deletedAt?: Date
}

export function createAgentModerationRetentionSpecialRows(
  oldMs: number,
  newMs: number,
  bulkAgentId: string,
  bulkPromptId: string,
  categoryAgentId: string,
  categoryPromptId: string,
): AgentModerationRetentionRow[] {
  const rows: AgentModerationRetentionRow[] = []
  const startMs = oldMs - 5 * 60_000

  rows.push({
    id: seedUuidAtTimestamp(startMs - 3, 1),
    postId: seedUuid(0, '05'),
    promptId: bulkPromptId,
    agentId: bulkAgentId,
    inputVersion: 20,
  })

  const keeperPost = seedUuid(1, '05')
  rows.push(
    {
      id: seedUuidAtTimestamp(startMs - 2, 2),
      postId: keeperPost,
      promptId: bulkPromptId,
      agentId: bulkAgentId,
      inputVersion: 21,
    },
    {
      id: seedUuidAtTimestamp(startMs - 1, 3),
      postId: keeperPost,
      promptId: bulkPromptId,
      agentId: bulkAgentId,
      inputVersion: 22,
    },
    {
      id: seedUuidAtTimestamp(startMs, 4),
      postId: keeperPost,
      promptId: bulkPromptId,
      agentId: bulkAgentId,
      inputVersion: 23,
      deletedAt: new Date(oldMs - 10),
    },
  )

  const referencePost = seedUuid(40, '05')
  rows.push(
    {
      id: seedUuidAtTimestamp(startMs + 220, 500),
      postId: referencePost,
      promptId: bulkPromptId,
      agentId: bulkAgentId,
      inputVersion: 24,
    },
    {
      id: seedUuidAtTimestamp(newMs + 200, 500),
      postId: referencePost,
      promptId: bulkPromptId,
      agentId: seedUuid(2_000_000, '36'),
      inputVersion: 25,
    },
  )

  for (let index = 0; index < 25; index += 1) {
    const postId = seedUuid(10 + index, '05')
    rows.push(
      {
        id: seedUuidAtTimestamp(startMs + 100 + index, 10 + index),
        postId,
        promptId: categoryPromptId,
        agentId: categoryAgentId,
        inputVersion: 30,
      },
      {
        id: seedUuidAtTimestamp(newMs + index, 100 + index),
        postId,
        promptId: categoryPromptId,
        agentId: categoryAgentId,
        inputVersion: 31,
      },
    )
  }

  for (let index = 0; index < 5; index += 1) {
    const postId = seedUuid(35 + index, '05')
    rows.push(
      {
        id: seedUuidAtTimestamp(startMs + 220, 200 + index),
        postId,
        promptId: categoryPromptId,
        agentId: categoryAgentId,
        inputVersion: 32,
      },
      {
        id: seedUuidAtTimestamp(newMs + 100 + index, 300 + index),
        postId,
        promptId: categoryPromptId,
        agentId: categoryAgentId,
        inputVersion: 33,
      },
    )
  }
  return rows
}

export async function insertAgentModerationRetentionBulk(
  oldStartMs: number,
  newMs: number,
  postCount: number,
  agentId: string,
  promptId: string,
): Promise<void> {
  const rows: { id: string; postId: string; inputVersion: number }[] = []
  for (let index = 0; index < postCount; index += 1) {
    const postId = seedUuid(100 + index, '05')
    rows.push(
      { id: seedUuidAtTimestamp(oldStartMs + index * 2, index), postId, inputVersion: 1 },
      { id: seedUuidAtTimestamp(oldStartMs + index * 2 + 1, index), postId, inputVersion: 2 },
      { id: seedUuidAtTimestamp(newMs + index, index), postId, inputVersion: 3 },
    )
  }
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE)
    // no-mistakes-disable-next-line query-reached-per-item: fixed retention fixtures are inserted in bounded batches below PostgreSQL bind limits
    await write(
      `/* seedAgentModerationRetentionBulk */
       INSERT INTO agent_moderations
         (id, post_id, input_sha256, prompt_id, agent_id, results, is_flagged)
       SELECT input.id, input.post_id,
         decode(repeat('0', 62) || lpad(to_hex(input.input_version), 2, '0'), 'hex'),
         $3::uuid, $4::uuid, '{}'::jsonb, FALSE
       FROM unnest($1::uuid[], $2::uuid[], $5::int[])
         AS input(id, post_id, input_version)
       ON CONFLICT (post_id, input_sha256, prompt_id) DO NOTHING`,
      [
        batch.map(row => row.id),
        batch.map(row => row.postId),
        promptId,
        agentId,
        batch.map(row => row.inputVersion),
      ],
    )
  }
}

export async function insertAgentModerationRetentionRows(
  rows: readonly AgentModerationRetentionRow[],
): Promise<void> {
  await write(
    `/* seedAgentModerationRetentionSpecial */
     INSERT INTO agent_moderations
       (id, post_id, input_sha256, prompt_id, agent_id, results, is_flagged, deleted_at)
     SELECT input.id, input.post_id,
       decode(repeat('0', 62) || lpad(to_hex(input.input_version), 2, '0'), 'hex'),
       input.prompt_id, input.agent_id, '{}'::jsonb, FALSE, input.deleted_at
     FROM unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::uuid[], $5::int[], $6::timestamptz[])
       AS input(id, post_id, prompt_id, agent_id, input_version, deleted_at)
     ON CONFLICT (post_id, input_sha256, prompt_id) DO NOTHING`,
    [
      rows.map(row => row.id),
      rows.map(row => row.postId),
      rows.map(row => row.promptId),
      rows.map(row => row.agentId),
      rows.map(row => row.inputVersion),
      rows.map(row => row.deletedAt ?? null),
    ],
  )
}
