import { describe, expect, it } from 'vitest'
import { createSystemUser } from '@voucha/test-helpers'
import { getTestSupportMessageLifecycleChanges } from '@voucha/test-helpers/entities/support-messages'
import {
  claimKeyedSupportAgentRun,
  createIdempotentSupportDraftMessage,
  createSupportMessage,
  createSupportThread,
  getOrCreateSupportContactByEmail,
} from './index.mts'

describe('createIdempotentSupportDraftMessage', () => {
  it('returns the same draft to concurrent callers for one agent run', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`support-concurrent-draft-${suffix}`)
    const contact = await getOrCreateSupportContactByEmail(
      `tests+support-concurrent-draft-${suffix}@voucha.ai`,
    )
    const thread = await createSupportThread(contact.id, `Concurrent draft ${suffix}`)
    const inbound = await createSupportMessage(thread.id, {
      direction: 'inbound',
      bodyText: 'Create one concurrent draft.',
      createdById: user.id,
    })
    const run = await claimKeyedSupportAgentRun({
      supportThreadId: thread.id,
      supportMessageId: inbound.id,
      idempotencyKey: `support-concurrent-draft-${suffix}`,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: { message_count: 1 },
    })
    if (!run) throw new Error('Expected a keyed support agent run')

    const drafts = await Promise.all(
      Array.from({ length: 8 }, () =>
        createIdempotentSupportDraftMessage(thread.id, {
          bodyText: 'Concurrent draft.',
          agentRunId: run.id,
        }),
      ),
    )

    expect(new Set(drafts.map(draft => draft.id)).size).toBe(1)
    await expect(
      getTestSupportMessageLifecycleChanges(thread.id, drafts[0]!.id),
    ).resolves.toHaveLength(1)
  })

  it('returns the existing draft without another lifecycle row after a crash and reclaim', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`support-idempotent-draft-${suffix}`)
    const contact = await getOrCreateSupportContactByEmail(
      `tests+support-idempotent-draft-${suffix}@voucha.ai`,
    )
    const thread = await createSupportThread(contact.id, `Idempotent draft ${suffix}`)
    const inbound = await createSupportMessage(thread.id, {
      direction: 'inbound',
      bodyText: 'Create only one draft.',
      createdById: user.id,
    })
    const run = await claimKeyedSupportAgentRun({
      supportThreadId: thread.id,
      supportMessageId: inbound.id,
      idempotencyKey: `support-inbound-draft-${suffix}`,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: { message_count: 1 },
    })
    if (!run) throw new Error('Expected a keyed support agent run')

    const first = await createIdempotentSupportDraftMessage(thread.id, {
      bodyText: 'Original draft.',
      agentRunId: run.id,
    })
    const replayed = await createIdempotentSupportDraftMessage(thread.id, {
      bodyText: 'A replay must not replace the draft.',
      agentRunId: run.id,
    })

    expect(replayed.id).toBe(first.id)
    expect(replayed.body_text).toBe('Original draft.')
    await expect(getTestSupportMessageLifecycleChanges(thread.id, first.id)).resolves.toHaveLength(
      1,
    )
  })
})
