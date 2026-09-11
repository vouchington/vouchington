import { describe, expect, it } from 'vitest'
import { createSystemUser } from '@voucha/test-helpers'
import {
  getTestSupportInboundEmailFollowUpReceipt,
  insertTestSupportInboundEmailReceipt,
} from '@voucha/test-helpers/entities/support-messages'
import {
  claimKeyedSupportAgentRun,
  createSupportMessage,
  createSupportThread,
  finalizeKeyedSupportAgentRun,
  getOrCreateSupportContactByEmail,
  getSupportAgentRunById,
  getSupportMessagesByThreadId,
  updateClaimedSupportAgentRunError,
} from './index.mts'

async function createFixture() {
  const suffix = Math.random().toString(36).slice(2, 10)
  const user = await createSystemUser(`support-finalize-supersession-${suffix}`)
  const contact = await getOrCreateSupportContactByEmail(
    `tests+support-finalize-supersession-${suffix}@voucha.ai`,
  )
  const thread = await createSupportThread(contact.id, `Finalize supersession ${suffix}`)
  const inbound = await createSupportMessage(thread.id, {
    direction: 'inbound',
    bodyText: 'Please help.',
    createdById: user.id,
  })
  const sesMessageId = `ses-support-finalize-supersession-${suffix}`
  await insertTestSupportInboundEmailReceipt({
    sesMessageId,
    supportThreadId: thread.id,
    supportMessageId: inbound.id,
    customerSupportEnqueuedAt: null,
  })
  const run = await claimKeyedSupportAgentRun({
    supportThreadId: thread.id,
    supportMessageId: inbound.id,
    idempotencyKey: `support-finalize-supersession-${suffix}`,
    modelName: 'gpt-5.4-nano',
    modelProvider: 'openai',
    input: { message_count: 1 },
  })
  if (!run?.claim_token) throw new Error('Expected a keyed support agent run')
  return { thread, run, sesMessageId, user }
}

describe('finalizeKeyedSupportAgentRun supersession', () => {
  it('does not finalize a failed run into a draft', async () => {
    const { thread, run } = await createFixture()
    await updateClaimedSupportAgentRunError(run.id, run.claim_token!, { error: 'Provider failed' })

    await expect(
      finalizeKeyedSupportAgentRun({
        threadId: thread.id,
        supportMessageId: run.support_message_id,
        agentRunId: run.id,
        claimToken: run.claim_token!,
        responseText: 'Failed run draft.',
        iterations: 1,
        terminationReason: 'no_tool_calls',
      }),
    ).resolves.toBe(false)
    await expect(getSupportMessagesByThreadId(thread.id, { limit: 20 })).resolves.toMatchObject({
      results: expect.not.arrayContaining([
        expect.objectContaining({ body_text: 'Failed run draft.' }),
      ]),
    })
  })

  it('supersedes an automatic run when a newer inbound message has already committed', async () => {
    const { thread, run, sesMessageId, user } = await createFixture()
    await createSupportMessage(thread.id, {
      direction: 'inbound',
      bodyText: 'Newer inbound context.',
      createdById: user.id,
    })

    await expect(
      finalizeKeyedSupportAgentRun({
        threadId: thread.id,
        supportMessageId: run.support_message_id,
        agentRunId: run.id,
        claimToken: run.claim_token!,
        responseText: 'Older automatic draft.',
        iterations: 1,
        terminationReason: 'no_tool_calls',
      }),
    ).resolves.toBe(false)
    await expect(getSupportAgentRunById(run.id)).resolves.toMatchObject({
      status: 'completed',
      termination_reason: 'superseded',
    })
    await expect(getTestSupportInboundEmailFollowUpReceipt(sesMessageId)).resolves.toMatchObject({
      customer_support_completed_at: expect.any(Date),
    })
    await expect(getSupportMessagesByThreadId(thread.id, { limit: 20 })).resolves.toMatchObject({
      results: expect.not.arrayContaining([
        expect.objectContaining({ body_text: 'Older automatic draft.' }),
      ]),
    })
  })
})
