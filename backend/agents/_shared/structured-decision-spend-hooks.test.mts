import { randomUUID } from 'node:crypto'
import { Response } from 'undici'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { dynamicConfigPrimaryValkeyClient } from '@data-stores/valkey/clients'
import {
  acquireTestAiUsageDateReservation,
  countAiUsageRecordsForResponseId,
  createTestFutureUtcDay,
  createTestPost,
  createTestUser,
  findAiUsageRecordForAgent,
  findAiUsageRecordForPost,
  insertTestCommunity,
  pollUntilNotNull,
} from '@voucha/test-helpers'
import {
  clearDailyAiCostTotalCacheForTesting,
  getAccountingUncertaintyKey,
  getAccountingUncertaintySource,
  getDailyAiCostTotalMicrounits,
  OpenAiSpendCapBreachError,
  type OpenAiSpendCapBreach,
} from '@services/ai-usage'
import {
  createStructuredDecisionClient,
  type StructuredDecisionFetch,
  type StructuredDecisionRequest,
} from '@modules/structured-decisions'
import {
  createStructuredDecisionSpendHooks,
  type StructuredDecisionSpendAttribution,
} from './structured-decision-spend-hooks.mts'

const AGENT_SLUG = 'structured-decision-hooks-test'

const request: StructuredDecisionRequest = {
  state: 'Structured-decision spend hooks test content.',
  questions: [{ id: 'spam', type: 'noul', question: 'Is this spam?' }],
}

interface DecisionBody {
  id: string
  model: string
  provider: string
  usage: { input_tokens: number; output_tokens: number; cost?: number }
  answers: unknown[]
}

function makeDecisionBody(overrides: Partial<DecisionBody> = {}): DecisionBody {
  return {
    id: `dec_${randomUUID()}`,
    model: 'typesafe/jev-1.13-20260917',
    provider: 'TypeSafe',
    usage: { input_tokens: 12, output_tokens: 3, cost: 0.002 },
    answers: [{ id: 'spam', type: 'noul', noul: 0.4 }],
    ...overrides,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

async function buildPostAttribution(): Promise<{
  attribution: StructuredDecisionSpendAttribution
  postId: string
}> {
  const user = await createTestUser()
  const post = await createTestPost({ user })
  return { attribution: { postId: post.id }, postId: post.id }
}

function noBreachClient(
  attribution: StructuredDecisionSpendAttribution,
  fetch: StructuredDecisionFetch,
) {
  const hooks = createStructuredDecisionSpendHooks(AGENT_SLUG, attribution, {
    assertOpenAiSpendCapNotBreached: async () => null,
  })
  return createStructuredDecisionClient({
    transport: 'openrouter',
    apiKey: 'test-key',
    fetch,
    hooks,
  })
}

// record.test.mts already proves recordAiUsage's generic pricing/idempotency/fail-closed behavior
// in isolation, so these prove the WIRING for issue #616 -- that createStructuredDecisionSpendHooks,
// driving a real createStructuredDecisionClient with a mocked fetch, actually reaches the real
// ledger, daily cap, and accounting-uncertainty latch -- plus the attribution mapping any caller
// (autotagger's postId, or a community-scoped classifier's communityId, or neither) relies on.
describe('createStructuredDecisionSpendHooks', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('records a priced row keyed by the response id for a successful decision', async () => {
    vi.setSystemTime(new Date(`${createTestFutureUtcDay()}T12:00:00.000Z`))
    const { attribution, postId } = await buildPostAttribution()
    const body = makeDecisionBody()
    const fetch = vi
      .fn<StructuredDecisionFetch>()
      .mockImplementation(async () => jsonResponse(body))

    await noBreachClient(attribution, fetch).decide(request)

    const record = await pollUntilNotNull(() => findAiUsageRecordForPost(postId, AGENT_SLUG))
    expect(record).toMatchObject({ pricing_status: 'priced', input_tokens: 12, output_tokens: 3 })
    await expect(countAiUsageRecordsForResponseId(body.id)).resolves.toBe(1)
  })

  it('records the row for a 2xx response that then fails strict decoding', async () => {
    vi.setSystemTime(new Date(`${createTestFutureUtcDay()}T12:00:00.000Z`))
    const { attribution, postId } = await buildPostAttribution()
    const body = makeDecisionBody({ answers: [] })
    const fetch = vi
      .fn<StructuredDecisionFetch>()
      .mockImplementation(async () => jsonResponse(body))

    await expect(noBreachClient(attribution, fetch).decide(request)).rejects.toMatchObject({
      code: 'invalid-response',
    })

    const record = await pollUntilNotNull(() => findAiUsageRecordForPost(postId, AGENT_SLUG))
    expect(record).toMatchObject({ pricing_status: 'priced' })
    await expect(countAiUsageRecordsForResponseId(body.id)).resolves.toBe(1)
  })

  it('does not double-count a replayed response id', async () => {
    vi.setSystemTime(new Date(`${createTestFutureUtcDay()}T12:00:00.000Z`))
    const { attribution, postId } = await buildPostAttribution()
    const body = makeDecisionBody()
    const fetch = vi
      .fn<StructuredDecisionFetch>()
      .mockImplementation(async () => jsonResponse(body))
    const client = noBreachClient(attribution, fetch)

    await client.decide(request)
    await pollUntilNotNull(() => findAiUsageRecordForPost(postId, AGENT_SLUG))
    await client.decide(request)

    await expect(countAiUsageRecordsForResponseId(body.id)).resolves.toBe(1)
  })

  it('leaves a missing usage.cost unpriced and fails the daily cap closed for that day', async () => {
    const reservation = await acquireTestAiUsageDateReservation()
    onTestFinished(() => reservation.release())
    const requestDay = reservation.day
    vi.setSystemTime(new Date(`${requestDay}T12:00:00.000Z`))
    clearDailyAiCostTotalCacheForTesting()
    const { attribution, postId } = await buildPostAttribution()
    const body = makeDecisionBody({ usage: { input_tokens: 5, output_tokens: 2 } })
    const fetch = vi
      .fn<StructuredDecisionFetch>()
      .mockImplementation(async () => jsonResponse(body))

    await noBreachClient(attribution, fetch).decide(request)

    const record = await pollUntilNotNull(() => findAiUsageRecordForPost(postId, AGENT_SLUG))
    expect(record).toMatchObject({ pricing_status: 'unpriced', cost_microunits: null })
    await expect(getDailyAiCostTotalMicrounits(requestDay)).resolves.toMatchObject({
      hasUnpricedRows: true,
      day: requestDay,
    })
    clearDailyAiCostTotalCacheForTesting()
  })

  it('propagates a spend-cap breach from beforeAttempt without ever calling fetch', async () => {
    const breach: OpenAiSpendCapBreach = {
      reason: 'cap_exceeded',
      totalMicrounits: 20_000_000,
      dailyCapMicrounits: 10_000_000,
      day: '2026-01-01',
    }
    const hooks = createStructuredDecisionSpendHooks(
      AGENT_SLUG,
      {},
      { assertOpenAiSpendCapNotBreached: async () => breach },
    )
    const fetch = vi.fn<StructuredDecisionFetch>()
    const client = createStructuredDecisionClient({
      transport: 'openrouter',
      apiKey: 'test-key',
      fetch,
      hooks,
    })

    await expect(client.decide(request)).rejects.toBeInstanceOf(OpenAiSpendCapBreachError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('latches unknown_billed_attempt for the request day on an ambiguous provider failure', async () => {
    const day = createTestFutureUtcDay()
    vi.setSystemTime(new Date(`${day}T12:00:00.000Z`))
    const fetch = vi.fn<StructuredDecisionFetch>().mockResolvedValue(jsonResponse({}, 500))
    const key = getAccountingUncertaintyKey(day)

    try {
      await expect(noBreachClient({}, fetch).decide(request)).rejects.toMatchObject({
        code: 'provider-error',
      })
      await expect(getAccountingUncertaintySource(day)).resolves.toBe('unknown_billed_attempt')
    } finally {
      await dynamicConfigPrimaryValkeyClient.unlink([key])
    }
  })

  it('threads attribution.communityId through to the ledger row', async () => {
    vi.setSystemTime(new Date(`${createTestFutureUtcDay()}T12:00:00.000Z`))
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user.id })
    const body = makeDecisionBody({ usage: { input_tokens: 21, output_tokens: 6, cost: 0.001 } })
    const fetch = vi
      .fn<StructuredDecisionFetch>()
      .mockImplementation(async () => jsonResponse(body))

    await noBreachClient({ communityId: community.id }, fetch).decide(request)

    const record = await pollUntilNotNull(() =>
      findAiUsageRecordForAgent(AGENT_SLUG, { inputTokens: 21, outputTokens: 6 }),
    )
    expect(record?.community_id).toBe(community.id)
  })

  it('records under the agent slug with no post or community attribution when neither is given', async () => {
    vi.setSystemTime(new Date(`${createTestFutureUtcDay()}T12:00:00.000Z`))
    const body = makeDecisionBody({ usage: { input_tokens: 33, output_tokens: 9, cost: 0.001 } })
    const fetch = vi
      .fn<StructuredDecisionFetch>()
      .mockImplementation(async () => jsonResponse(body))

    await noBreachClient({}, fetch).decide(request)

    const record = await pollUntilNotNull(() =>
      findAiUsageRecordForAgent(AGENT_SLUG, { inputTokens: 33, outputTokens: 9 }),
    )
    expect(record?.community_id).toBeNull()
  })
})
