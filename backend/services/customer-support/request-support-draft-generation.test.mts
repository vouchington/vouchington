import { describe, expect, it, vi } from 'vitest'
import { createSystemUser } from '@voucha/test-helpers'
import {
  createSupportMessage,
  createSupportThread,
  getOrCreateSupportContactByEmail,
  getSupportAgentRunByIdempotencyKey,
  requestSupportDraftGeneration,
} from './index.mts'
import type { RequestSupportDraftGenerationDependencies } from './request-support-draft-generation.mts'

describe('requestSupportDraftGeneration', () => {
  it('keeps an ambiguously failed enqueue reserved under its stable key', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`support-draft-request-${suffix}`)
    const contact = await getOrCreateSupportContactByEmail(
      `tests+support-draft-request-${suffix}@voucha.ai`,
    )
    const thread = await createSupportThread(contact.id, `Draft request ${suffix}`)
    const inbound = await createSupportMessage(thread.id, {
      direction: 'inbound',
      bodyText: 'Please draft a reply.',
      createdById: user.id,
    })
    const enqueueCustomerSupport = vi
      .fn<RequestSupportDraftGenerationDependencies['enqueueCustomerSupport']>()
      .mockRejectedValue(new Error('response lost'))
    const params = { modelName: 'gpt-5.4-nano', modelProvider: 'openai' } as const

    await expect(
      requestSupportDraftGeneration(thread.id, params, { enqueueCustomerSupport }),
    ).rejects.toThrow('response lost')

    const enqueueOptions = enqueueCustomerSupport.mock.calls[0]?.[1]
    if (!enqueueOptions?.logicalJobId) throw new Error('Expected queued draft options')
    const { logicalJobId } = enqueueOptions
    await expect(getSupportAgentRunByIdempotencyKey(logicalJobId)).resolves.toMatchObject({
      support_message_id: inbound.id,
      completed_at: null,
      failed_at: null,
    })
    const retryEnqueue =
      vi.fn<RequestSupportDraftGenerationDependencies['enqueueCustomerSupport']>()
    await expect(
      requestSupportDraftGeneration(thread.id, params, { enqueueCustomerSupport: retryEnqueue }),
    ).resolves.toEqual({ status: 'unavailable' })
    expect(retryEnqueue).not.toHaveBeenCalled()
  })
})
