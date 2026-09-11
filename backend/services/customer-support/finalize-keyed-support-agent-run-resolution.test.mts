import { describe, expect, it } from 'vitest'
import { createSystemUser } from '@voucha/test-helpers'
import {
  getTestSupportInboundEmailFollowUpReceipt,
  insertTestSupportInboundEmailReceipt,
} from '@voucha/test-helpers/entities/support-messages'
import { resolveTestSupportThreadWhileLocked } from '@voucha/test-helpers/entities/support-threads'
import {
  claimKeyedSupportAgentRun,
  createSupportMessage,
  createSupportThread,
  finalizeKeyedSupportAgentRun,
  getSupportMessagesByThreadId,
  getOrCreateSupportContactByEmail,
} from './index.mts'

describe('automatic keyed finalization after resolution', () => {
  it('waits for resolution, then completes its inbound receipt without persisting a draft', async () => {
    const suffix = crypto.randomUUID()
    const user = await createSystemUser(`support-finalize-auto-resolution-${suffix}`)
    const contact = await getOrCreateSupportContactByEmail(
      `tests+support-finalize-auto-resolution-${suffix}@voucha.ai`,
    )
    const thread = await createSupportThread(contact.id, `Automatic resolution ${suffix}`)
    const inbound = await createSupportMessage(thread.id, {
      direction: 'inbound',
      bodyText: 'Automatic response remains durable after resolution.',
      createdById: user.id,
    })
    const sesMessageId = `ses-support-finalize-auto-resolution-${suffix}`
    await insertTestSupportInboundEmailReceipt({
      sesMessageId,
      supportThreadId: thread.id,
      supportMessageId: inbound.id,
      customerSupportEnqueuedAt: null,
    })
    const run = await claimKeyedSupportAgentRun({
      supportThreadId: thread.id,
      supportMessageId: inbound.id,
      idempotencyKey: `support-inbound-email__${inbound.id}__customer-support`,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: { message_count: 1 },
    })
    if (!run?.claim_token) throw new Error('Expected a keyed automatic support run')

    let release: (() => void) | undefined
    const releaseResolution = new Promise<void>(resolve => {
      release = resolve
    })
    let signal: (() => void) | undefined
    const locked = new Promise<void>(resolve => {
      signal = resolve
    })
    const resolution = resolveTestSupportThreadWhileLocked(
      thread.id,
      user.id,
      () => signal?.(),
      releaseResolution,
    )
    await locked
    const finalize = finalizeKeyedSupportAgentRun({
      threadId: thread.id,
      supportMessageId: inbound.id,
      agentRunId: run.id,
      claimToken: run.claim_token,
      responseText: 'Persist after resolution.',
      iterations: 1,
      terminationReason: 'no_tool_calls',
    })
    release?.()
    await resolution

    await expect(finalize).resolves.toBe(false)
    await expect(getTestSupportInboundEmailFollowUpReceipt(sesMessageId)).resolves.toMatchObject({
      customer_support_enqueued_at: expect.any(Date),
      customer_support_completed_at: expect.any(Date),
    })
    await expect(getSupportMessagesByThreadId(thread.id)).resolves.toMatchObject({
      results: [expect.objectContaining({ id: inbound.id })],
    })
  })
})
