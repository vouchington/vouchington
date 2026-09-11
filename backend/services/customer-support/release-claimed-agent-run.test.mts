import { describe, expect, it } from 'vitest'
import { createSystemUser } from '@voucha/test-helpers'
import {
  claimKeyedSupportAgentRun,
  createSupportAgentRun,
  createSupportMessage,
  createSupportThread,
  finalizeKeyedSupportAgentRun,
  getOrCreateSupportContactByEmail,
  getSupportAgentRunById,
  releaseClaimedSupportAgentRun,
} from './index.mts'
import type { SupportAgentRun } from './types.mts'

async function createSupportAgentRunFixture(): Promise<SupportAgentRun> {
  const random = Math.random().toString(36).slice(2, 10)
  const user = await createSystemUser(`release-claimed-run-${random}`)
  const contact = await getOrCreateSupportContactByEmail(
    `tests+release-claimed-run-${random}@voucha.ai`,
  )
  const thread = await createSupportThread(contact.id, `Release claimed run ${random}`)
  const message = await createSupportMessage(thread.id, {
    direction: 'inbound',
    bodyText: 'I need help with my account.',
    createdById: user.id,
  })

  return createSupportAgentRun({
    supportThreadId: thread.id,
    supportMessageId: message.id,
    modelName: 'gpt-5.4-nano',
    modelProvider: 'openai',
    input: { message_count: 1 },
  })
}

describe('releaseClaimedSupportAgentRun', () => {
  it('clears claim_token without marking the run completed or failed', async () => {
    const fixture = await createSupportAgentRunFixture()
    const run = await claimKeyedSupportAgentRun({
      supportThreadId: fixture.support_thread_id,
      supportMessageId: fixture.support_message_id,
      idempotencyKey: `release-claimed-run-${Math.random().toString(36).slice(2, 10)}`,
      modelName: fixture.model_name,
      modelProvider: fixture.model_provider,
      input: { message_count: 1 },
    })
    if (!run?.claim_token) throw new Error('Expected an initial keyed support agent run')

    await expect(releaseClaimedSupportAgentRun(run.id, run.claim_token)).resolves.toBe(true)

    await expect(getSupportAgentRunById(run.id)).resolves.toMatchObject({
      claim_token: null,
      completed_at: null,
      failed_at: null,
    })
  })

  it('does not release a run owned by a different (already-rotated) claim token', async () => {
    const fixture = await createSupportAgentRunFixture()
    const run = await claimKeyedSupportAgentRun({
      supportThreadId: fixture.support_thread_id,
      supportMessageId: fixture.support_message_id,
      idempotencyKey: `release-claimed-run-stale-${Math.random().toString(36).slice(2, 10)}`,
      modelName: fixture.model_name,
      modelProvider: fixture.model_provider,
      input: { message_count: 1 },
    })
    if (!run?.claim_token) throw new Error('Expected an initial keyed support agent run')

    await expect(releaseClaimedSupportAgentRun(run.id, 'stale-claim-token')).resolves.toBe(false)
    await expect(getSupportAgentRunById(run.id)).resolves.toMatchObject({
      claim_token: run.claim_token,
    })
  })

  it('does not release a run that already finalized', async () => {
    const fixture = await createSupportAgentRunFixture()
    const run = await claimKeyedSupportAgentRun({
      supportThreadId: fixture.support_thread_id,
      supportMessageId: fixture.support_message_id,
      idempotencyKey: `release-claimed-run-finalized-${Math.random().toString(36).slice(2, 10)}`,
      modelName: fixture.model_name,
      modelProvider: fixture.model_provider,
      input: { message_count: 1 },
    })
    if (!run?.claim_token) throw new Error('Expected an initial keyed support agent run')
    await finalizeKeyedSupportAgentRun({
      threadId: fixture.support_thread_id,
      supportMessageId: run.support_message_id,
      agentRunId: run.id,
      claimToken: run.claim_token,
      responseText: null,
      iterations: 1,
      terminationReason: 'no_tool_calls',
    })

    await expect(releaseClaimedSupportAgentRun(run.id, run.claim_token)).resolves.toBe(false)
    await expect(getSupportAgentRunById(run.id)).resolves.toMatchObject({ status: 'completed' })
  })
})
