import { v7 as uuidv7 } from 'uuid'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { insertTestAgentModeration } from './entities/post-llm-moderations.mts'
import {
  attachTestAgentModerationAuditReference,
  attachTestAgentModerationTrainingReference,
  createTestAgentModerationRetentionFixture,
} from './entities/agent-moderation-retention.mts'

export async function createTestAgentModerationRetentionPage() {
  const fixture = await createTestAgentModerationRetentionFixture()
  const oldId = await insertTestAgentModeration({
    ...fixture,
    occurredAt: new Date('2026-07-04T00:00:00Z'),
  })
  const newestId = await insertTestAgentModeration({
    ...fixture,
    occurredAt: new Date('2026-10-28T00:00:00Z'),
  })
  return { ...fixture, oldId, newestId }
}

export async function createTestAgentModerationRetentionContinuationPage() {
  const fixture = await createTestAgentModerationRetentionPage()
  const secondId = await insertTestAgentModeration({
    ...fixture,
    occurredAt: new Date('2026-07-05T00:00:00Z'),
  })
  const thirdId = await insertTestAgentModeration({
    ...fixture,
    occurredAt: new Date('2026-07-06T00:00:00Z'),
  })
  await attachTestAgentModerationAuditReference(fixture.postId, fixture.oldId)
  await attachTestAgentModerationTrainingReference(fixture.postId, secondId)
  return { ...fixture, secondId, thirdId }
}

export async function getTestAgentModerationRetentionState(postId: string, id: string) {
  const { rows } = await read<{
    dueAt: string | null
    blockedReason: string | null
  }>(sql`/* getTestAgentModerationRetentionState */
    SELECT to_char(retention_due_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "dueAt",
      retention_blocked_reason AS "blockedReason"
    FROM agent_moderations WHERE post_id = ${postId}::uuid AND id = ${id}::uuid
  `)
  return rows[0] ?? null
}

export function createTestAgentModerationRetentionCursor(postId: string) {
  return {
    afterDueAt: '2026-10-01T00:00:00.000Z',
    afterId: uuidv7({ msecs: Date.parse('2026-07-03T00:00:00Z') }),
    afterPostId: postId,
    upperBoundDueAt: '2026-10-29T00:00:00.000Z',
    upperBoundId: uuidv7({ msecs: Date.parse('2026-07-31T00:00:00Z') }),
  }
}
