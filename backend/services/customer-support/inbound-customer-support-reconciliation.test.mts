import { describe, expect, it, vi } from 'vitest'
import { getTestSupportInboundEmailFollowUpReceipt } from '@voucha/test-helpers/entities/support-messages'
import {
  clearTestSupportInboundCustomerSupportMarkers,
  completeTestSupportInboundCustomerSupportReceipt,
} from '@voucha/test-helpers/entities/support-inbound-email-receipts'
import { createInboundSupportEmailMessage } from './create-inbound-support-message.mts'
import { listInboundCustomerSupportRecoveryCandidates } from './inbound-customer-support-reconciliation.mts'
import { claimKeyedSupportAgentRun } from './agent-runs.mts'
import { finalizeKeyedSupportAgentRun } from './finalize-keyed-support-agent-run.mts'

describe('inbound customer-support reconciliation', () => {
  it('finds a persisted inbound message even after its S3 source is gone', async () => {
    const suffix = crypto.randomUUID()
    const sesMessageId = `ses-db-only-recovery-${suffix}`
    const persisted = await createInboundSupportEmailMessage(
      {
        sesMessageId,
        s3ObjectKey: `incoming/${sesMessageId}`,
        fromEmail: `tests+db-only-recovery-${suffix}@voucha.ai`,
        subject: `DB-only recovery ${suffix}`,
        bodyText: 'The raw S3 object has already been deleted.',
        emailTo: 'support@voucha.ai',
      },
      {
        enqueueEmbedding: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        enqueueCustomerSupport: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      },
    )
    if (!persisted.is_new) throw new Error('Expected a new inbound support message')

    const page = await listInboundCustomerSupportRecoveryCandidates({ limit: 100 })

    expect(page.results).toContainEqual({
      threadId: persisted.threadId,
      supportMessageId: persisted.message.id,
      logicalJobId: `support_inbound_email__${persisted.message.id}__customer_support`,
    })
  })

  it('excludes inbound messages whose keyed support run is completed', async () => {
    const suffix = crypto.randomUUID()
    const sesMessageId = `ses-completed-recovery-${suffix}`
    const persisted = await createInboundSupportEmailMessage(
      {
        sesMessageId,
        s3ObjectKey: `incoming/${sesMessageId}`,
        fromEmail: `tests+completed-recovery-${suffix}@voucha.ai`,
        subject: `Completed recovery ${suffix}`,
        bodyText: 'This message already has a completed response.',
        emailTo: 'support@voucha.ai',
      },
      {
        enqueueEmbedding: async () => undefined,
        enqueueCustomerSupport: async () => undefined,
      },
    )
    if (!persisted.is_new) throw new Error('Expected a new inbound support message')
    const logicalJobId = `support_inbound_email__${persisted.message.id}__customer_support`
    const run = await claimKeyedSupportAgentRun({
      supportThreadId: persisted.threadId,
      supportMessageId: persisted.message.id,
      idempotencyKey: logicalJobId,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: { message_count: 1 },
    })
    if (!run) throw new Error('Expected a keyed support agent run')
    await finalizeKeyedSupportAgentRun({
      threadId: persisted.threadId,
      supportMessageId: persisted.message.id,
      agentRunId: run.id,
      claimToken: run.claim_token!,
      responseText: 'Completed response.',
      iterations: 1,
      terminationReason: 'no_tool_calls',
    })
    await clearTestSupportInboundCustomerSupportMarkers(sesMessageId)

    const page = await listInboundCustomerSupportRecoveryCandidates({ limit: 100 })

    expect(page.results.map(candidate => candidate.logicalJobId)).not.toContain(logicalJobId)
    await expect(getTestSupportInboundEmailFollowUpReceipt(sesMessageId)).resolves.toMatchObject({
      customer_support_enqueued_at: expect.any(Date),
      customer_support_completed_at: expect.any(Date),
    })
  })

  it('excludes a duplicate receipt already completed by automatic-draft suppression', async () => {
    const suffix = crypto.randomUUID()
    const sesMessageId = `ses-suppressed-recovery-a-${suffix}`
    const emailMessageId = `message-id-suppressed-recovery-${suffix}`
    const dependencies = {
      enqueueEmbedding: async () => undefined,
      enqueueCustomerSupport: async () => undefined,
    }
    const first = await createInboundSupportEmailMessage(
      {
        sesMessageId,
        s3ObjectKey: `incoming/${sesMessageId}`,
        fromEmail: `tests+suppressed-recovery-${suffix}@voucha.ai`,
        subject: `Suppressed recovery ${suffix}`,
        bodyText: 'First inbound message.',
        emailTo: 'support@voucha.ai',
        emailMessageId,
      },
      dependencies,
    )
    if (!first.is_new) throw new Error('Expected a new inbound support message')
    await completeTestSupportInboundCustomerSupportReceipt(sesMessageId)
    const duplicate = await createInboundSupportEmailMessage(
      {
        sesMessageId: `ses-suppressed-recovery-b-${suffix}`,
        s3ObjectKey: `incoming/ses-suppressed-recovery-b-${suffix}`,
        fromEmail: `tests+suppressed-recovery-${suffix}@voucha.ai`,
        subject: `Suppressed recovery ${suffix}`,
        bodyText: 'First inbound message.',
        emailTo: 'support@voucha.ai',
        emailMessageId,
      },
      dependencies,
    )
    expect(duplicate.is_new).toBe(false)
    const page = await listInboundCustomerSupportRecoveryCandidates({ limit: 100 })
    expect(page.results.map(candidate => candidate.supportMessageId)).not.toContain(
      first.message.id,
    )
  })

  it('paginates an exact limit without duplicates and rejects malformed cursors', async () => {
    const suffix = crypto.randomUUID()
    const persisted = []
    for (let index = 0; index < 3; index += 1) {
      const sesMessageId = `ses-recovery-page-${index}-${suffix}`
      const result = await createInboundSupportEmailMessage(
        {
          sesMessageId,
          s3ObjectKey: `incoming/${sesMessageId}`,
          fromEmail: `tests+recovery-page-${suffix}@voucha.ai`,
          subject: `Recovery page ${suffix}`,
          bodyText: `Recovery candidate ${index}`,
          emailTo: 'support@voucha.ai',
        },
        {
          enqueueEmbedding: async () => undefined,
          enqueueCustomerSupport: async () => undefined,
        },
      )
      if (!result.is_new) throw new Error('Expected a new recovery candidate')
      persisted.push(result)
    }

    const firstPage = await listInboundCustomerSupportRecoveryCandidates({
      after: Buffer.from(JSON.stringify({ id: persisted[0]!.message.id })).toString('base64url'),
      limit: 1,
    })
    expect(firstPage.results).toHaveLength(1)
    expect(firstPage.page_info.has_next_page).toBe(true)
    expect(firstPage.page_info.end_cursor).not.toBeNull()
    const secondPage = await listInboundCustomerSupportRecoveryCandidates({
      after: firstPage.page_info.end_cursor!,
      limit: 1,
    })
    expect(secondPage.results).toHaveLength(1)
    expect(secondPage.results[0]!.logicalJobId).not.toBe(firstPage.results[0]!.logicalJobId)
    expect(secondPage.page_info.has_next_page).toBe(secondPage.page_info.end_cursor !== null)
    await expect(
      listInboundCustomerSupportRecoveryCandidates({ after: 'malformed', limit: 1 }),
    ).rejects.toThrow('Invalid recovery cursor')
  })
})
