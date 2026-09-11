import { describe, expect, it } from 'vitest'
import {
  countAiUsageRecordsForAgent,
  findAiUsageRecordForAgent,
  pollUntilNotNull,
  setBackgroundResponseLeaseExpiresAt,
} from '@voucha/test-helpers'
import {
  claimExpiredBackgroundResponse,
  deleteBackgroundResponseRegistration,
  claimAndRecordBackgroundResponseUsage,
  getExpiredBackgroundResponses,
  type ExpiredBackgroundResponse,
  type OwnedBackgroundResponseLease,
} from '@services/openai-background-responses'
import type { Response } from 'openai/resources/responses/responses'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import {
  callRecordingAgentResponseUsage,
  recordAgentResponseUsage,
} from '../record-response-usage.mts'
import { OpenAIResponseNotCompletedError, getBackgroundResponseHooks } from '../create-response.mts'

// callRecordingAgentResponseUsage's fn never actually calls createOpenAIResponse here. It awaits
// getBackgroundResponseHooks()?.onResponseCreated(responseId) itself, exactly like
// drainBackgroundOpenAIResponse does once a real response.created event arrives. That is enough to
// drive the openai_background_responses compare-and-set without mocking anything: every call below
// exercises real inserts/deletes against Postgres.
function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10)
}

async function notifyResponseCreated(responseId: string): Promise<OwnedBackgroundResponseLease> {
  const lease = await getBackgroundResponseHooks()?.onResponseCreated(responseId)
  if (!lease || !('leaseToken' in lease)) throw new Error('background response lease unavailable')
  return lease as OwnedBackgroundResponseLease
}

async function expireAndClaim(
  lease: OwnedBackgroundResponseLease,
): Promise<ExpiredBackgroundResponse> {
  await setBackgroundResponseLeaseExpiresAt(lease.responseId, '1900-01-01T00:00:00Z')
  const candidate = (await getExpiredBackgroundResponses({ batchSize: 100 })).find(
    row => row.responseId === lease.responseId,
  )
  if (!candidate) throw new Error('expired lease was not selected')
  const claimed = await claimExpiredBackgroundResponse(candidate)
  if (!claimed) throw new Error('expired lease was not claimed')
  return claimed
}

describe('callRecordingAgentResponseUsage', () => {
  it('reports degraded idempotency while preserving append behavior without a response id', async () => {
    const agentSlug = `record-response-usage-missing-id-${randomSuffix()}`
    sentryCaptureExceptionMock.mockClear()

    await recordAgentResponseUsage({
      response: {
        model: 'gpt-5.4-nano-2026-03-17',
        service_tier: 'flex',
        usage: { input_tokens: 100, output_tokens: 51 },
      },
      agentSlug,
    })

    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('without a response id') }),
      expect.anything(),
    )
    await expect(
      pollUntilNotNull(() =>
        findAiUsageRecordForAgent(agentSlug, { inputTokens: 100, outputTokens: 51 }),
      ),
    ).resolves.not.toBeNull()
  })

  it('records the ledger row and claims (deletes) the registration when this path wins', async () => {
    const agentSlug = `record-response-usage-claim-wins-${randomSuffix()}`
    const responseId = `resp_${randomSuffix()}`
    const usage = { input_tokens: 101, output_tokens: 52 }
    let lease: OwnedBackgroundResponseLease | undefined

    const response = await callRecordingAgentResponseUsage(
      async () => {
        lease = await notifyResponseCreated(responseId)
        await lease.stopAndSettle()
        return { id: responseId, model: 'gpt-5.4-nano-2026-03-17', service_tier: 'flex', usage }
      },
      { agentSlug },
    )

    expect(response.id).toBe(responseId)
    const row = await pollUntilNotNull(() =>
      findAiUsageRecordForAgent(agentSlug, { inputTokens: 101, outputTokens: 52 }),
    )
    if (!row) throw new Error('ai_usage_records row was not written')
    expect(row.model).toBe('gpt-5.4-nano-2026-03-17')
    expect(row.service_tier).toBe('flex')

    // The registration row must already be gone -- this path's own compare-and-set claimed it, so
    // a second delete attempt (what the sweeper would do) finds nothing left to claim.
    if (!lease) throw new Error('background response lease unavailable')
    await expect(deleteBackgroundResponseRegistration(responseId, lease.leaseToken)).resolves.toBe(
      false,
    )
  })

  it('records exactly one row when the completion path races a concurrent sweeper-style claim on the same registration (idempotency)', async () => {
    // A given OpenAI response id is only ever registered once -- it is unique per API call, so two
    // independent callRecordingAgentResponseUsage invocations never race to *insert* the same row.
    // The real race the compare-and-set guards is one already-registered row being claimed by two
    // independent readers at once: this path's own asynchronous claim
    // (recordAgentResponseUsage -> claimRegisteredResponseUsage) and a sweeper-style claim calling
    // the same claimAndRecordBackgroundResponseUsage that reconcile.mts uses (invoked directly
    // below since reconcile.mts's own retrieve()/cancel() calls the live OpenAI API and aren't
    // reachable from a non-mocked test). Only one delete may return true; assert exactly one
    // ai_usage_records row results regardless of which side wins.
    const agentSlug = `record-response-usage-idempotent-${randomSuffix()}`
    const responseId = `resp_${randomSuffix()}`
    const usage = { input_tokens: 102, output_tokens: 53 }
    let lease: OwnedBackgroundResponseLease | undefined

    let releaseFn: (() => void) | undefined
    const fnGate = new Promise<void>(resolve => {
      releaseFn = resolve
    })

    const completionPath = callRecordingAgentResponseUsage(
      async () => {
        lease = await notifyResponseCreated(responseId)
        // Hold this path open until the sweeper-style claim (below) is armed and ready, so both
        // claims genuinely race on the same row instead of one trivially finishing first.
        await fnGate
        return { id: responseId, model: 'gpt-5.4-nano-2026-03-17', service_tier: 'flex', usage }
      },
      { agentSlug },
    )

    const acquiredLease = await pollUntilNotNull(async () => lease ?? null)
    if (!acquiredLease) throw new Error('background response lease was not acquired')
    const sweeperLease = await expireAndClaim(acquiredLease)

    // The sweeper-style claim: reconcile.mts's own claimAndRecordBackgroundResponseUsage call,
    // started before releasing the completion path so both attempts are in flight together.
    const sweeperClaim = claimAndRecordBackgroundResponseUsage({
      responseId,
      leaseToken: sweeperLease.leaseToken,
      agentSlug,
      model: 'gpt-5.4-nano-2026-03-17',
      serviceTier: 'flex',
      usage,
      createdAt: sweeperLease.createdAt,
    })

    // The creator token is already stale after expireAndClaim. Await the sweeper write first so
    // the completion path sees the response-id fence instead of latching the shared request day.
    await sweeperClaim
    releaseFn?.()
    await completionPath

    // Both contenders have settled before counting; response-id idempotency admits one row.
    await pollUntilNotNull(() =>
      findAiUsageRecordForAgent(agentSlug, { inputTokens: 102, outputTokens: 53 }),
    )

    await expect(
      countAiUsageRecordsForAgent(agentSlug, { inputTokens: 102, outputTokens: 53 }),
    ).resolves.toBe(1)
  })

  it('falls through to direct recording when the registration insert itself fails', async () => {
    const agentSlug = `record-response-usage-insert-fails-${randomSuffix()}`
    const completedResponseId = `resp_insert_failure_${randomSuffix()}`
    const usage = { input_tokens: 104, output_tokens: 55 }

    const response = await callRecordingAgentResponseUsage(
      async () => {
        // An empty response id violates openai_background_responses' CHECK constraint
        // (char_length BETWEEN 1 AND 100), so the awaited registration attempt rejects --
        // simulating a registration failure without mocking anything. registration.registered
        // resolves to false, so recording falls straight through to recordAiUsage.
        await getBackgroundResponseHooks()?.onResponseCreated('')
        return {
          id: completedResponseId,
          model: 'gpt-5.4-nano-2026-03-17',
          service_tier: 'flex',
          usage,
        }
      },
      { agentSlug },
    )

    expect(response.id).toBe(completedResponseId)
    const row = await pollUntilNotNull(() =>
      findAiUsageRecordForAgent(agentSlug, { inputTokens: 104, outputTokens: 55 }),
    )
    if (!row) throw new Error('ai_usage_records row was not written despite the failed insert')
    expect(row.model).toBe('gpt-5.4-nano-2026-03-17')
  })

  it('records from a thrown OpenAIResponseNotCompletedError and still claims the registration', async () => {
    const agentSlug = `record-response-usage-not-completed-${randomSuffix()}`
    const responseId = `resp_${randomSuffix()}`
    const usage = { input_tokens: 105, output_tokens: 56 }

    await expect(
      callRecordingAgentResponseUsage(
        async () => {
          const lease = await notifyResponseCreated(responseId)
          await lease.stopAndSettle()
          throw new OpenAIResponseNotCompletedError('OpenAI response cancelled', {
            id: responseId,
            status: 'cancelled',
            model: 'gpt-5.4-nano-2026-03-17',
            service_tier: 'flex',
            usage,
          } as Response)
        },
        { agentSlug },
      ),
    ).rejects.toThrow('OpenAI response cancelled')

    const row = await pollUntilNotNull(() =>
      findAiUsageRecordForAgent(agentSlug, { inputTokens: 105, outputTokens: 56 }),
    )
    if (!row) throw new Error('ai_usage_records row was not written for the thrown error')
    expect(row.model).toBe('gpt-5.4-nano-2026-03-17')

    // Claimed (deleted) by this path, same as the completed-response case above.
    const remaining = (await getExpiredBackgroundResponses({ batchSize: 100 })).find(
      row => row.responseId === responseId,
    )
    expect(remaining).toBeUndefined()
  })

  it('leaves the registration for the sweeper on an abort that is not OpenAIResponseNotCompletedError', async () => {
    const agentSlug = `record-response-usage-abort-${randomSuffix()}`
    const responseId = `resp_${randomSuffix()}`
    let lease: OwnedBackgroundResponseLease | undefined

    await expect(
      callRecordingAgentResponseUsage(
        async () => {
          lease = await notifyResponseCreated(responseId)
          await lease.stopAndSettle()
          throw new Error('socket closed')
        },
        { agentSlug },
      ),
    ).rejects.toThrow('socket closed')

    // recordAgentResponseUsage must never be called on this path -- the registration row is left
    // exactly as drainBackgroundOpenAIResponse's own cancellation left it, for the sweeper to
    // eventually cancel/retrieve/record/delete.
    if (!lease) throw new Error('background response lease unavailable')
    await expect(deleteBackgroundResponseRegistration(responseId, lease.leaseToken)).resolves.toBe(
      true,
    )
  })
})
