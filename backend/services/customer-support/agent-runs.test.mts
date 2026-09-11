import { describe, expect, it } from 'vitest'
import { createSystemUser } from '@voucha/test-helpers'
import { expireTestSupportAgentRunLease } from '@voucha/test-helpers/entities/support-agent-runs'
import {
  claimKeyedSupportAgentRun,
  createSupportAgentRun,
  createSupportMessage,
  createSupportThread,
  finalizeKeyedSupportAgentRun,
  getSupportAgentRunById,
  getOrCreateSupportContactByEmail,
  updateClaimedSupportAgentRunError,
  updateSupportAgentRunError,
  updateSupportAgentRunOutput,
} from './index.mts'
import type { SupportAgentRun } from './types.mts'

async function createSupportAgentRunFixture(): Promise<SupportAgentRun> {
  const random = Math.random().toString(36).slice(2, 10)
  const user = await createSystemUser(`support-agent-run-${random}`)
  const contact = await getOrCreateSupportContactByEmail(`tests+agent-run-${random}@voucha.ai`)
  const thread = await createSupportThread(contact.id, `Agent run ${random}`)
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

describe('customer-support agent runs', () => {
  it('createSupportAgentRun returns running derived status', async () => {
    const run = await createSupportAgentRunFixture()

    expect(run.id).toBeDefined()
    expect(run.claim_token).toBeNull()
    expect(run.status).toBe('running')
    expect(run.completed_at).toBeNull()
    expect(run.failed_at).toBeNull()
  })

  it('lets a retry of the same stable job reclaim a live incomplete run', async () => {
    const idempotencyKey = `support-inbound-agent-${Math.random().toString(36).slice(2, 10)}`
    const fixture = await createSupportAgentRunFixture()
    const params = {
      supportThreadId: fixture.support_thread_id,
      supportMessageId: fixture.support_message_id,
      idempotencyKey,
      modelName: fixture.model_name,
      modelProvider: fixture.model_provider,
      input: { message_count: 1 },
    } as const
    const first = await claimKeyedSupportAgentRun(params)
    if (!first?.claim_token) throw new Error('Expected an initial keyed support agent claim token')

    await expect(claimKeyedSupportAgentRun(params)).resolves.toBeNull()
    const reclaimed = await claimKeyedSupportAgentRun({ ...params, reclaimLiveLease: true })

    expect(reclaimed?.id).toBe(first?.id)
    if (!reclaimed?.claim_token) throw new Error('Expected the stable job retry to reclaim its run')
    expect(reclaimed.claim_token).not.toBe(first.claim_token)
    await finalizeKeyedSupportAgentRun({
      threadId: fixture.support_thread_id,
      supportMessageId: reclaimed.support_message_id,
      agentRunId: reclaimed.id,
      claimToken: reclaimed.claim_token,
      responseText: null,
      iterations: 1,
      terminationReason: 'no_tool_calls',
    })
    await expect(
      claimKeyedSupportAgentRun({ ...params, reclaimLiveLease: true }),
    ).resolves.toBeNull()
  })

  it('reclaims an expired incomplete run without creating another row', async () => {
    const fixture = await createSupportAgentRunFixture()
    const params = {
      supportThreadId: fixture.support_thread_id,
      supportMessageId: fixture.support_message_id,
      idempotencyKey: `support-inbound-expired-${Math.random().toString(36).slice(2, 10)}`,
      modelName: fixture.model_name,
      modelProvider: fixture.model_provider,
      input: { message_count: 1 },
    } as const
    const first = await claimKeyedSupportAgentRun(params)
    if (!first?.claim_token) throw new Error('Expected an initial keyed support agent run')
    await expireTestSupportAgentRunLease(first.id)

    const reclaimed = await claimKeyedSupportAgentRun(params)

    expect(reclaimed?.id).toBe(first.id)
    expect(reclaimed?.claim_token).not.toBe(first.claim_token)
  })

  it('retains the persisted model and provider when a keyed run is reclaimed', async () => {
    const fixture = await createSupportAgentRunFixture()
    const idempotencyKey = `support-inbound-model-audit-${Math.random().toString(36).slice(2, 10)}`
    const first = await claimKeyedSupportAgentRun({
      supportThreadId: fixture.support_thread_id,
      supportMessageId: fixture.support_message_id,
      idempotencyKey,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: { message_count: 1 },
    })
    if (!first) throw new Error('Expected initial keyed support agent run')

    const reclaimed = await claimKeyedSupportAgentRun({
      supportThreadId: fixture.support_thread_id,
      supportMessageId: fixture.support_message_id,
      idempotencyKey,
      modelName: 'claude-sonnet-5',
      modelProvider: 'anthropic',
      input: { message_count: 1 },
      reclaimLiveLease: true,
    })

    expect(reclaimed).toMatchObject({
      id: first.id,
      model_name: 'gpt-5.4-nano',
      model_provider: 'openai',
    })
  })

  it('rejects an automatic keyed claim whose payload names a different inbound message', async () => {
    const fixture = await createSupportAgentRunFixture()
    const laterInbound = await createSupportMessage(fixture.support_thread_id, {
      direction: 'inbound',
      bodyText: 'This payload must not replace the original automatic intent.',
    })
    const params = {
      supportThreadId: fixture.support_thread_id,
      supportMessageId: fixture.support_message_id,
      idempotencyKey: `support-inbound-mismatch-${Math.random().toString(36).slice(2, 10)}`,
      modelName: fixture.model_name,
      modelProvider: fixture.model_provider,
      input: { message_count: 1 },
    } as const
    const initial = await claimKeyedSupportAgentRun(params)
    if (!initial) throw new Error('Expected initial keyed support agent run')

    await expect(
      claimKeyedSupportAgentRun({
        ...params,
        supportMessageId: laterInbound.id,
        reclaimLiveLease: true,
      }),
    ).resolves.toBeNull()
  })

  it('updateSupportAgentRunOutput records successful completion timestamps', async () => {
    const run = await createSupportAgentRunFixture()
    const output = { response: 'Please check your billing address.', iterations: 2 }

    await updateSupportAgentRunOutput(run.id, output, 'no_tool_calls')

    const updated = await getSupportAgentRunById(run.id)
    expect(updated!.output).toEqual(output)
    expect(updated!.status).toBe('completed')
    expect(updated!.termination_reason).toBe('no_tool_calls')
    expect(updated!.completed_at).toBeInstanceOf(Date)
    expect(updated!.failed_at).toBeNull()
  })

  it('updateSupportAgentRunError records failed timestamps', async () => {
    const run = await createSupportAgentRunFixture()
    const error = { error: 'OpenAI rate limit' }

    await updateSupportAgentRunError(run.id, error)

    const updated = await getSupportAgentRunById(run.id)
    expect(updated!.error).toEqual(error)
    expect(updated!.status).toBe('failed')
    expect(updated!.termination_reason).toBe('error')
    expect(updated!.completed_at).toBeNull()
    expect(updated!.failed_at).toBeInstanceOf(Date)
  })

  it('atomically reclaims one failed keyed run and clears its terminal failure state', async () => {
    const fixture = await createSupportAgentRunFixture()
    const params = {
      supportThreadId: fixture.support_thread_id,
      supportMessageId: fixture.support_message_id,
      idempotencyKey: `support-inbound-failed-${Math.random().toString(36).slice(2, 10)}`,
      modelName: fixture.model_name,
      modelProvider: fixture.model_provider,
      input: { message_count: 1 },
    } as const
    const first = await claimKeyedSupportAgentRun(params)
    if (!first?.claim_token) throw new Error('Expected an initial keyed support agent run')
    await updateClaimedSupportAgentRunError(first.id, first.claim_token, {
      error: 'Temporary provider failure',
    })

    const claims = await Promise.all(
      Array.from({ length: 8 }, () => claimKeyedSupportAgentRun(params)),
    )
    const reclaimed = claims.filter((run): run is SupportAgentRun => run !== null)

    expect(reclaimed).toHaveLength(1)
    expect(reclaimed[0]!.id).toBe(first.id)
    expect(reclaimed[0]!.claim_token).not.toBe(first.claim_token)
    expect(reclaimed[0]).toMatchObject({
      status: 'running',
      output: null,
      error: null,
      termination_reason: null,
      completed_at: null,
      failed_at: null,
    })
  })

  it('does not let a stale failure overwrite a completed run', async () => {
    const fixture = await createSupportAgentRunFixture()
    const run = await claimKeyedSupportAgentRun({
      supportThreadId: fixture.support_thread_id,
      supportMessageId: fixture.support_message_id,
      idempotencyKey: `support-inbound-stale-error-${Math.random().toString(36).slice(2, 10)}`,
      modelName: fixture.model_name,
      modelProvider: fixture.model_provider,
      input: { message_count: 1 },
    })
    if (!run?.claim_token) throw new Error('Expected a keyed support agent run')
    const output = { response: null, iterations: 1 }
    await finalizeKeyedSupportAgentRun({
      threadId: fixture.support_thread_id,
      supportMessageId: run.support_message_id,
      agentRunId: run.id,
      claimToken: run.claim_token,
      responseText: null,
      iterations: 1,
      terminationReason: 'no_tool_calls',
    })

    await expect(
      updateClaimedSupportAgentRunError(run.id, run.claim_token, { error: 'Late rejection' }),
    ).resolves.toBe(false)

    await expect(getSupportAgentRunById(run.id)).resolves.toMatchObject({
      status: 'completed',
      output,
      error: null,
      termination_reason: 'no_tool_calls',
      failed_at: null,
    })
  })

  it('lets only one concurrent claimant rotate a failed run token', async () => {
    const fixture = await createSupportAgentRunFixture()
    const params = {
      supportThreadId: fixture.support_thread_id,
      supportMessageId: fixture.support_message_id,
      idempotencyKey: `support-inbound-concurrent-token-${Math.random().toString(36).slice(2, 10)}`,
      modelName: fixture.model_name,
      modelProvider: fixture.model_provider,
      input: { message_count: 1 },
    } as const
    const first = await claimKeyedSupportAgentRun(params)
    if (!first?.claim_token) throw new Error('Expected an initial keyed support agent run')
    await updateClaimedSupportAgentRunError(first.id, first.claim_token, { error: 'Retry me' })

    const claims = await Promise.all(
      Array.from({ length: 8 }, () => claimKeyedSupportAgentRun(params)),
    )
    const winners = claims.filter((run): run is SupportAgentRun => run !== null)

    expect(winners).toHaveLength(1)
    expect(winners[0]!.claim_token).not.toBe(first.claim_token)
  })
})
