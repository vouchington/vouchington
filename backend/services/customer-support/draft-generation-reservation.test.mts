import { describe, expect, it } from 'vitest'
import { createSystemUser } from '@voucha/test-helpers'
import {
  expireTestSupportDraftGenerationReservation,
  waitForBlockedSupportThreadLock,
} from '@voucha/test-helpers/entities/support-agent-runs'
import { insertTestSupportInboundEmailReceipt } from '@voucha/test-helpers/entities/support-messages'
import {
  claimKeyedSupportAgentRun,
  createInboundSupportEmailMessage,
  createSupportMessage,
  createSupportThread,
  finalizeKeyedSupportAgentRun,
  getSupportAgentRunById,
  getSupportMessagesByThreadId,
  getOrCreateSupportContactByEmail,
  reserveSupportDraftGeneration,
  updateClaimedSupportAgentRunError,
} from './index.mts'

describe('reserveSupportDraftGeneration', () => {
  it('reports when an open thread has no inbound message to ground a draft', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const contact = await getOrCreateSupportContactByEmail(
      `tests+support-draft-no-inbound-${suffix}@voucha.ai`,
    )
    const thread = await createSupportThread(contact.id, `Subject-only thread ${suffix}`)

    await expect(
      reserveSupportDraftGeneration(thread.id, {
        modelName: 'gpt-5.4-nano',
        modelProvider: 'openai',
      }),
    ).resolves.toEqual({ status: 'no_inbound_message' })
  })

  it('waits for an existing-thread inbound transaction and observes its automatic draft intent', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const emailMessageId = `<support-lock-${suffix}@voucha.ai>`
    const first = await createInboundSupportEmailMessage(
      {
        sesMessageId: `ses-support-lock-first-${suffix}`,
        s3ObjectKey: `incoming/support-lock-first-${suffix}`,
        fromEmail: `tests+support-lock-${suffix}@voucha.ai`,
        subject: 'Thread lock',
        bodyText: 'First inbound.',
        emailMessageId,
        emailTo: 'support@voucha.ai',
      },
      { enqueueEmbedding: async () => undefined, enqueueCustomerSupport: async () => undefined },
    )
    if (!first.is_new) throw new Error('Expected initial inbound message')
    let release: (() => void) | undefined
    const barrier = new Promise<void>(resolve => {
      release = resolve
    })
    let signal: (() => void) | undefined
    const locked = new Promise<void>(resolve => {
      signal = resolve
    })
    const inbound = createInboundSupportEmailMessage(
      {
        sesMessageId: `ses-support-lock-second-${suffix}`,
        s3ObjectKey: `incoming/support-lock-second-${suffix}`,
        fromEmail: `tests+support-lock-${suffix}@voucha.ai`,
        subject: 'Thread lock reply',
        bodyText: 'Second inbound.',
        replyRef: emailMessageId,
        emailTo: 'support@voucha.ai',
      },
      {
        enqueueEmbedding: async () => undefined,
        enqueueCustomerSupport: async () => undefined,
        beforePersistInboundMessage: async () => {
          signal?.()
          await barrier
        },
      },
    )
    await locked
    const reservation = reserveSupportDraftGeneration(first.threadId, {
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
    })
    await waitForBlockedSupportThreadLock()
    release?.()
    await inbound
    await expect(reservation).resolves.toEqual({ status: 'unavailable' })
  })
  it('reclaims an abandoned unclaimed staff reservation after its lease expires', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`support-draft-abandoned-${suffix}`)
    const contact = await getOrCreateSupportContactByEmail(
      `tests+support-draft-abandoned-${suffix}@voucha.ai`,
    )
    const thread = await createSupportThread(contact.id, `Abandoned reservation ${suffix}`)
    const firstInbound = await createSupportMessage(thread.id, {
      direction: 'inbound',
      bodyText: 'Please help with this request.',
      createdById: user.id,
    })
    const params = { modelName: 'gpt-5.4-nano', modelProvider: 'openai' } as const
    const first = await reserveSupportDraftGeneration(thread.id, params)
    if (first.status !== 'reserved')
      throw new Error('Expected initial draft generation reservation')

    await expireTestSupportDraftGenerationReservation(first.id)
    const latestInbound = await createSupportMessage(thread.id, {
      direction: 'inbound',
      bodyText: 'Please use this newer context.',
      createdById: user.id,
    })

    await expect(reserveSupportDraftGeneration(thread.id, params)).resolves.toEqual({
      ...first,
      supportMessageId: latestInbound.id,
    })
    expect(latestInbound.id).not.toBe(firstInbound.id)
  })

  it('does not reserve a staff draft while the latest inbound email has active automatic work', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`support-draft-auto-${suffix}`)
    const contact = await getOrCreateSupportContactByEmail(
      `tests+support-draft-auto-${suffix}@voucha.ai`,
    )
    const thread = await createSupportThread(contact.id, `Automatic inbound work ${suffix}`)
    const inbound = await createSupportMessage(thread.id, {
      direction: 'inbound',
      bodyText: 'An automatic draft is pending.',
      createdById: user.id,
    })
    await insertTestSupportInboundEmailReceipt({
      sesMessageId: `ses-support-draft-auto-${suffix}`,
      supportThreadId: thread.id,
      supportMessageId: inbound.id,
      customerSupportEnqueuedAt: null,
    })

    await expect(
      reserveSupportDraftGeneration(thread.id, {
        modelName: 'gpt-5.4-nano',
        modelProvider: 'openai',
      }),
    ).resolves.toEqual({ status: 'unavailable' })
  })

  it('supersedes a staff-first run when a newer inbound email arrives and rejects its stale job', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const firstMessageId = `<support-staff-first-${suffix}@voucha.ai>`
    const contact = await getOrCreateSupportContactByEmail(
      `tests+support-staff-first-${suffix}@voucha.ai`,
    )
    const thread = await createSupportThread(contact.id, 'Staff reservation is superseded')
    const first = await createSupportMessage(thread.id, {
      direction: 'inbound',
      bodyText: 'Inbound A.',
      emailMessageId: firstMessageId,
    })
    const params = { modelName: 'gpt-5.4-nano', modelProvider: 'openai' } as const
    const staffReservation = await reserveSupportDraftGeneration(thread.id, params)
    if (staffReservation.status !== 'reserved') throw new Error('Expected staff reservation for A')
    const staffRun = await claimKeyedSupportAgentRun({
      supportThreadId: thread.id,
      supportMessageId: first.id,
      idempotencyKey: staffReservation.idempotencyKey,
      ...params,
      input: { source: 'staff_draft_request' },
    })
    if (!staffRun?.claim_token) throw new Error('Expected the staff job to claim A')

    const automaticJobs: Array<{ threadId: string; messageId: string }> = []
    const second = await createInboundSupportEmailMessage(
      {
        sesMessageId: `ses-support-staff-first-next-${suffix}`,
        s3ObjectKey: `incoming/support-staff-first-next-${suffix}`,
        fromEmail: `tests+support-staff-first-${suffix}@voucha.ai`,
        subject: 'Staff reservation is superseded',
        bodyText: 'Inbound B.',
        replyRef: firstMessageId,
        emailTo: 'support@voucha.ai',
      },
      {
        enqueueEmbedding: async () => undefined,
        enqueueCustomerSupport: async (threadId, messageId) => {
          automaticJobs.push({ threadId, messageId })
        },
      },
    )
    if (!second.is_new) throw new Error('Expected inbound B')

    await expect(
      claimKeyedSupportAgentRun({
        supportThreadId: thread.id,
        supportMessageId: first.id,
        idempotencyKey: staffReservation.idempotencyKey,
        ...params,
        input: { source: 'staff_draft_request' },
      }),
    ).resolves.toBeNull()
    await expect(
      finalizeKeyedSupportAgentRun({
        threadId: thread.id,
        supportMessageId: first.id,
        agentRunId: staffRun.id,
        claimToken: staffRun.claim_token,
        responseText: 'Stale staff draft.',
        iterations: 1,
        terminationReason: 'no_tool_calls',
      }),
    ).resolves.toBe(false)
    await expect(getSupportAgentRunById(staffRun.id)).resolves.toMatchObject({
      status: 'completed',
      termination_reason: 'superseded',
    })
    expect(automaticJobs).toEqual([{ threadId: thread.id, messageId: second.message.id }])
    await expect(getSupportMessagesByThreadId(thread.id)).resolves.toMatchObject({
      results: expect.not.arrayContaining([
        expect.objectContaining({ body_text: 'Stale staff draft.' }),
      ]),
    })
  })

  it('allows one concurrent unsent draft generation and permits a retry after failure', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`support-draft-reservation-${suffix}`)
    const contact = await getOrCreateSupportContactByEmail(
      `tests+support-draft-reservation-${suffix}@voucha.ai`,
    )
    const thread = await createSupportThread(contact.id, `Draft reservation ${suffix}`)
    const inbound = await createSupportMessage(thread.id, {
      direction: 'inbound',
      bodyText: 'Please help with this request.',
      createdById: user.id,
    })
    const params = { modelName: 'gpt-5.4-nano', modelProvider: 'openai' } as const

    const reservations = await Promise.all(
      Array.from({ length: 8 }, () => reserveSupportDraftGeneration(thread.id, params)),
    )
    const [reservation] = reservations.filter(
      (candidate): candidate is Extract<typeof candidate, { status: 'reserved' }> =>
        candidate.status === 'reserved',
    )
    expect(reservations.filter(candidate => candidate.status === 'reserved')).toHaveLength(1)
    expect(reservation?.supportMessageId).toBe(inbound.id)
    if (!reservation) throw new Error('Expected one draft generation reservation')

    const run = await claimKeyedSupportAgentRun({
      supportThreadId: thread.id,
      supportMessageId: inbound.id,
      idempotencyKey: reservation.idempotencyKey,
      ...params,
      input: { source: 'staff_draft_request' },
    })
    if (!run?.claim_token) throw new Error('Expected reserved run to be claimed')
    await updateClaimedSupportAgentRunError(run.id, run.claim_token, { error: 'Queue unavailable' })

    await expect(reserveSupportDraftGeneration(thread.id, params)).resolves.toMatchObject({
      supportMessageId: inbound.id,
    })
  })
})
