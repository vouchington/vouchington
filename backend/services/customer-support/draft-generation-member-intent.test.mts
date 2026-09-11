import { describe, expect, it } from 'vitest'
import { createSystemUser } from '@voucha/test-helpers'
import {
  claimKeyedSupportAgentRun,
  createSupportMessage,
  createSupportThread,
  getMemberSupportAgentJobId,
  getOrCreateSupportContactByEmail,
  reserveAutomaticSupportAgentIntent,
  reserveSupportDraftGeneration,
  updateClaimedSupportAgentRunError,
} from './index.mts'

describe('staff draft reservation member intent coordination', () => {
  it('blocks staff while a failed member intent remains recoverable', async () => {
    const suffix = crypto.randomUUID()
    const user = await createSystemUser(`support-member-intent-${suffix}`)
    const contact = await getOrCreateSupportContactByEmail(
      `tests+support-member-intent-${suffix}@voucha.ai`,
    )
    const thread = await createSupportThread(contact.id, `Member intent ${suffix}`)
    const message = await createSupportMessage(thread.id, {
      direction: 'inbound',
      bodyText: 'Please help with my account.',
      createdById: user.id,
    })
    const model = { modelName: 'gpt-5.4-nano', modelProvider: 'openai' } as const
    await reserveAutomaticSupportAgentIntent(
      {
        supportThreadId: thread.id,
        supportMessageId: message.id,
        ...model,
        input: { thread_subject: thread.subject, message_count: 1 },
      },
      {},
    )
    const run = await claimKeyedSupportAgentRun({
      supportThreadId: thread.id,
      supportMessageId: message.id,
      idempotencyKey: getMemberSupportAgentJobId(message.id),
      ...model,
      input: { message_count: 1 },
    })
    if (!run?.claim_token) throw new Error('Expected member intent claim')
    await updateClaimedSupportAgentRunError(run.id, run.claim_token, { error: 'Retry me' })

    await expect(reserveSupportDraftGeneration(thread.id, model)).resolves.toEqual({
      status: 'unavailable',
    })
  })
})
