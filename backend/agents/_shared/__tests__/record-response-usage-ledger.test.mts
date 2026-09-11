import { describe, expect, it } from 'vitest'
import {
  countAiUsageRecordsForAgent,
  findAiUsageRecordForAgent,
  setBackgroundResponseLeaseExpiresAt,
} from '@voucha/test-helpers'
import {
  acquireBackgroundResponseLease,
  claimAndRecordBackgroundResponseUsage,
  claimExpiredBackgroundResponse,
  deleteBackgroundResponseRegistration,
  getExpiredBackgroundResponses,
  type ExpiredBackgroundResponse,
  type OwnedBackgroundResponseLease,
} from '@services/openai-background-responses'
import { claimRegisteredResponseUsage } from '../record-response-usage-ledger.mts'

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10)
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

describe('claimRegisteredResponseUsage lost-race settlement', () => {
  it('fails closed when the lease is lost before the response-id fence exists', async () => {
    const agentSlug = `record-response-usage-claim-lost-${randomSuffix()}`
    const responseId = `resp_${randomSuffix()}`
    const usage = { input_tokens: 103, output_tokens: 54 }
    const lease = await acquireBackgroundResponseLease({ responseId, agentSlug })
    if (!lease) throw new Error('background response lease unavailable')
    const sweeperLease = await expireAndClaim(lease)

    await expect(
      claimRegisteredResponseUsage({
        responseId,
        usage,
        model: 'gpt-5.4-nano-2026-03-17',
        serviceTier: 'flex',
        agentSlug,
        registration: { responseId, lease },
      }),
    ).rejects.toThrow(
      `Background response usage is still unsettled after losing the lease: ${responseId}`,
    )
    await expect(
      findAiUsageRecordForAgent(agentSlug, { inputTokens: 103, outputTokens: 54 }),
    ).resolves.toBeNull()
    await deleteBackgroundResponseRegistration(responseId, sweeperLease.leaseToken)
  })

  it('treats a lost lease as settled once the response-id fence exists', async () => {
    const agentSlug = `record-response-usage-claim-lost-fenced-${randomSuffix()}`
    const responseId = `resp_${randomSuffix()}`
    const usage = { input_tokens: 108, output_tokens: 59 }
    const lease = await acquireBackgroundResponseLease({ responseId, agentSlug })
    if (!lease) throw new Error('background response lease unavailable')
    const sweeperLease = await expireAndClaim(lease)
    await expect(
      claimAndRecordBackgroundResponseUsage({
        responseId,
        leaseToken: sweeperLease.leaseToken,
        agentSlug,
        model: 'gpt-5.4-nano-2026-03-17',
        serviceTier: 'flex',
        usage,
        createdAt: sweeperLease.createdAt,
      }),
    ).resolves.toBe('recorded')

    await expect(
      claimRegisteredResponseUsage({
        responseId,
        usage,
        model: 'gpt-5.4-nano-2026-03-17',
        serviceTier: 'flex',
        agentSlug,
        registration: { responseId, lease },
      }),
    ).resolves.toBeUndefined()
    await expect(
      countAiUsageRecordsForAgent(agentSlug, { inputTokens: 108, outputTokens: 59 }),
    ).resolves.toBe(1)
  })
})
