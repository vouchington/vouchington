import { describe, expect, it } from 'vitest'
import { createSystemUser } from '@voucha/test-helpers'
import {
  getTestSupportInboundEmailFollowUpReceipt,
  getTestSupportMessageLifecycleChanges,
  insertTestSupportInboundEmailReceipt,
} from '@voucha/test-helpers/entities/support-messages'
import { clearTestSupportInboundCustomerSupportCompletedAt } from '@voucha/test-helpers/entities/support-inbound-email-receipts'
import { markTestSupportAgentRunStaffRequested } from '@voucha/test-helpers/entities/support-agent-runs'
import { resolveTestSupportThreadWhileLocked } from '@voucha/test-helpers/entities/support-threads'
import {
  claimKeyedSupportAgentRun,
  createIdempotentSupportDraftMessage,
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
  const user = await createSystemUser(`support-finalize-run-${suffix}`)
  const contact = await getOrCreateSupportContactByEmail(
    `tests+support-finalize-run-${suffix}@voucha.ai`,
  )
  const thread = await createSupportThread(contact.id, `Finalize run ${suffix}`)
  const inbound = await createSupportMessage(thread.id, {
    direction: 'inbound',
    bodyText: 'Please help.',
    createdById: user.id,
  })
  const sesMessageId = `ses-support-finalize-run-${suffix}`
  await insertTestSupportInboundEmailReceipt({
    sesMessageId,
    supportThreadId: thread.id,
    supportMessageId: inbound.id,
    customerSupportEnqueuedAt: null,
  })
  const claimParams = {
    supportThreadId: thread.id,
    supportMessageId: inbound.id,
    idempotencyKey: `support-finalize-run-${suffix}`,
    modelName: 'gpt-5.4-nano',
    modelProvider: 'openai',
    input: { message_count: 1 },
  } as const
  const run = await claimKeyedSupportAgentRun(claimParams)
  if (!run?.claim_token) throw new Error('Expected a keyed support agent run')
  return { thread, run, claimParams, sesMessageId, user }
}

describe('finalizeKeyedSupportAgentRun', () => {
  it('fails a staff draft when resolution commits while finalization waits on the thread lock', async () => {
    const { thread, run, user } = await createFixture()
    await markTestSupportAgentRunStaffRequested(run.id)
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
      supportMessageId: run.support_message_id,
      agentRunId: run.id,
      claimToken: run.claim_token!,
      responseText: 'Must not persist.',
      iterations: 1,
      terminationReason: 'no_tool_calls',
    })
    release?.()
    await resolution
    await expect(finalize).resolves.toBe(false)
    await expect(getSupportAgentRunById(run.id)).resolves.toMatchObject({ status: 'failed' })
    await expect(getSupportMessagesByThreadId(thread.id, { limit: 20 })).resolves.toMatchObject({
      results: [expect.not.objectContaining({ body_text: 'Must not persist.' })],
    })
  })
  it('atomically creates one draft lifecycle and completes its run', async () => {
    const { thread, run, sesMessageId } = await createFixture()
    await expect(getTestSupportInboundEmailFollowUpReceipt(sesMessageId)).resolves.toMatchObject({
      customer_support_enqueued_at: null,
      customer_support_completed_at: null,
    })

    await expect(
      finalizeKeyedSupportAgentRun({
        threadId: thread.id,
        supportMessageId: run.support_message_id,
        agentRunId: run.id,
        claimToken: run.claim_token!,
        responseText: 'Persist this draft.',
        iterations: 2,
        terminationReason: 'no_tool_calls',
      }),
    ).resolves.toBe(true)

    const receipt = await getTestSupportInboundEmailFollowUpReceipt(sesMessageId)
    expect(receipt?.customer_support_enqueued_at).toBeInstanceOf(Date)
    expect(receipt?.customer_support_completed_at).toBeInstanceOf(Date)
    await clearTestSupportInboundCustomerSupportCompletedAt(sesMessageId)
    await expect(
      finalizeKeyedSupportAgentRun({
        threadId: thread.id,
        supportMessageId: run.support_message_id,
        agentRunId: run.id,
        claimToken: run.claim_token!,
        responseText: 'Ignored completed replay.',
        iterations: 9,
        terminationReason: 'max_iterations',
      }),
    ).resolves.toBe(false)
    expect(
      (await getTestSupportInboundEmailFollowUpReceipt(sesMessageId))
        ?.customer_support_completed_at,
    ).toBeInstanceOf(Date)

    const { results: messages } = await getSupportMessagesByThreadId(thread.id, { limit: 20 })
    const draft = messages.find(message => message.direction === 'outbound')
    expect(draft?.body_text).toBe('Persist this draft.')
    await expect(getSupportAgentRunById(run.id)).resolves.toMatchObject({
      status: 'completed',
      output: { response: 'Persist this draft.', iterations: 2 },
      termination_reason: 'no_tool_calls',
    })
    await expect(getTestSupportMessageLifecycleChanges(thread.id, draft!.id)).resolves.toHaveLength(
      1,
    )
  })

  it('fences a prior claimant after a live reclaim', async () => {
    const { thread, run: first, claimParams } = await createFixture()
    const second = await claimKeyedSupportAgentRun({ ...claimParams, reclaimLiveLease: true })
    if (!second?.claim_token) throw new Error('Expected a reclaimed keyed support agent run')

    await expect(
      finalizeKeyedSupportAgentRun({
        threadId: thread.id,
        supportMessageId: first.support_message_id,
        agentRunId: first.id,
        claimToken: first.claim_token!,
        responseText: 'Stale claimant draft.',
        iterations: 1,
        terminationReason: 'no_tool_calls',
      }),
    ).resolves.toBe(false)
    await expect(
      updateClaimedSupportAgentRunError(first.id, first.claim_token!, {
        error: 'Stale claimant error',
      }),
    ).resolves.toBe(false)
    await expect(
      finalizeKeyedSupportAgentRun({
        threadId: thread.id,
        supportMessageId: second.support_message_id,
        agentRunId: second.id,
        claimToken: second.claim_token!,
        responseText: 'Current claimant draft.',
        iterations: 2,
        terminationReason: 'no_tool_calls',
      }),
    ).resolves.toBe(true)

    await expect(getSupportAgentRunById(second.id)).resolves.toMatchObject({
      status: 'completed',
      output: { response: 'Current claimant draft.', iterations: 2 },
      error: null,
    })
    const { results: messages } = await getSupportMessagesByThreadId(thread.id, { limit: 20 })
    expect(messages.filter(message => message.direction === 'outbound')).toMatchObject([
      { body_text: 'Current claimant draft.' },
    ])
  })

  it('completes an orphan-draft replay with the persisted body and one lifecycle', async () => {
    const { thread, run } = await createFixture()
    const original = await createIdempotentSupportDraftMessage(thread.id, {
      bodyText: 'Original draft.',
      agentRunId: run.id,
    })

    await finalizeKeyedSupportAgentRun({
      threadId: thread.id,
      supportMessageId: run.support_message_id,
      agentRunId: run.id,
      claimToken: run.claim_token!,
      responseText: 'Different replay draft.',
      iterations: 5,
      terminationReason: 'max_iterations',
    })

    const { results: messages } = await getSupportMessagesByThreadId(thread.id, { limit: 20 })
    const drafts = messages.filter(message => message.direction === 'outbound')
    expect(drafts).toHaveLength(1)
    expect(drafts[0]!.body_text).toBe('Original draft.')
    await expect(getSupportAgentRunById(run.id)).resolves.toMatchObject({
      output: { response: 'Original draft.', iterations: 5 },
      termination_reason: 'max_iterations',
    })
    await expect(
      getTestSupportMessageLifecycleChanges(thread.id, original.id),
    ).resolves.toHaveLength(1)
  })

  it('uses an orphan draft as output when the replay generates no candidate text', async () => {
    const { thread, run } = await createFixture()
    const original = await createIdempotentSupportDraftMessage(thread.id, {
      bodyText: 'Persisted before the retry.',
      agentRunId: run.id,
    })

    await finalizeKeyedSupportAgentRun({
      threadId: thread.id,
      supportMessageId: run.support_message_id,
      agentRunId: run.id,
      claimToken: run.claim_token!,
      responseText: null,
      iterations: 2,
      terminationReason: 'no_tool_calls',
    })

    await expect(getSupportAgentRunById(run.id)).resolves.toMatchObject({
      output: { response: 'Persisted before the retry.', iterations: 2 },
      status: 'completed',
    })
    await expect(
      getTestSupportMessageLifecycleChanges(thread.id, original.id),
    ).resolves.toHaveLength(1)
  })

  it('rolls back the draft and lifecycle when run completion fails', async () => {
    const { thread, run } = await createFixture()

    await expect(
      finalizeKeyedSupportAgentRun({
        threadId: thread.id,
        supportMessageId: run.support_message_id,
        agentRunId: run.id,
        claimToken: run.claim_token!,
        responseText: 'Must roll back.',
        iterations: 1,
        terminationReason: 'not-a-real-reason' as never,
      }),
    ).rejects.toThrow('invalid input value for enum')

    const { results: messages } = await getSupportMessagesByThreadId(thread.id, { limit: 20 })
    expect(messages.filter(message => message.direction === 'outbound')).toHaveLength(0)
    await expect(getSupportAgentRunById(run.id)).resolves.toMatchObject({
      status: 'running',
      output: null,
      termination_reason: null,
    })
  })
})
