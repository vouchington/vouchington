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
  findAiUsageRecordForPost,
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
import type { AutotaggerReceiptSubject } from '@services/autotagger'
import { createAutotaggerStructuredDecisionHooks } from './structured-decision-attempt-hooks.mts'

const request: StructuredDecisionRequest = {
  state: 'Autotagger billing hook test content.',
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

async function buildSubject(): Promise<{ subject: AutotaggerReceiptSubject; postId: string }> {
  const user = await createTestUser()
  const post = await createTestPost({ user })
  return { subject: { postId: post.id, rssFeedItemId: null }, postId: post.id }
}

function noBreachClient(subject: AutotaggerReceiptSubject, fetch: StructuredDecisionFetch) {
  const hooks = createAutotaggerStructuredDecisionHooks(subject, {
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
// in isolation, so these only prove the WIRING for issue #616: that
// createAutotaggerStructuredDecisionHooks, driving a real createStructuredDecisionClient with a
// mocked fetch, actually reaches the real ledger, daily cap, and accounting-uncertainty latch.
describe('createAutotaggerStructuredDecisionHooks', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('records a priced row keyed by the response id for a successful decision', async () => {
    vi.setSystemTime(new Date(`${createTestFutureUtcDay()}T12:00:00.000Z`))
    const { subject, postId } = await buildSubject()
    const body = makeDecisionBody()
    const fetch = vi
      .fn<StructuredDecisionFetch>()
      .mockImplementation(async () => jsonResponse(body))

    await noBreachClient(subject, fetch).decide(request)

    const record = await pollUntilNotNull(() => findAiUsageRecordForPost(postId, 'autotagger'))
    expect(record).toMatchObject({ pricing_status: 'priced', input_tokens: 12, output_tokens: 3 })
    await expect(countAiUsageRecordsForResponseId(body.id)).resolves.toBe(1)
  })

  it('records the row for a 2xx response that then fails strict decoding', async () => {
    vi.setSystemTime(new Date(`${createTestFutureUtcDay()}T12:00:00.000Z`))
    const { subject, postId } = await buildSubject()
    const body = makeDecisionBody({ answers: [] })
    const fetch = vi
      .fn<StructuredDecisionFetch>()
      .mockImplementation(async () => jsonResponse(body))

    await expect(noBreachClient(subject, fetch).decide(request)).rejects.toMatchObject({
      code: 'invalid-response',
    })

    const record = await pollUntilNotNull(() => findAiUsageRecordForPost(postId, 'autotagger'))
    expect(record).toMatchObject({ pricing_status: 'priced' })
    await expect(countAiUsageRecordsForResponseId(body.id)).resolves.toBe(1)
  })

  it('does not double-count a replayed response id', async () => {
    vi.setSystemTime(new Date(`${createTestFutureUtcDay()}T12:00:00.000Z`))
    const { subject, postId } = await buildSubject()
    const body = makeDecisionBody()
    const fetch = vi
      .fn<StructuredDecisionFetch>()
      .mockImplementation(async () => jsonResponse(body))
    const client = noBreachClient(subject, fetch)

    await client.decide(request)
    await pollUntilNotNull(() => findAiUsageRecordForPost(postId, 'autotagger'))
    await client.decide(request)

    await expect(countAiUsageRecordsForResponseId(body.id)).resolves.toBe(1)
  })

  it('leaves a missing usage.cost unpriced and fails the daily cap closed for that day', async () => {
    const reservation = await acquireTestAiUsageDateReservation()
    onTestFinished(() => reservation.release())
    const requestDay = reservation.day
    vi.setSystemTime(new Date(`${requestDay}T12:00:00.000Z`))
    clearDailyAiCostTotalCacheForTesting()
    const { subject, postId } = await buildSubject()
    const body = makeDecisionBody({ usage: { input_tokens: 5, output_tokens: 2 } })
    const fetch = vi
      .fn<StructuredDecisionFetch>()
      .mockImplementation(async () => jsonResponse(body))

    await noBreachClient(subject, fetch).decide(request)

    const record = await pollUntilNotNull(() => findAiUsageRecordForPost(postId, 'autotagger'))
    expect(record).toMatchObject({ pricing_status: 'unpriced', cost_microunits: null })
    await expect(getDailyAiCostTotalMicrounits(requestDay)).resolves.toMatchObject({
      hasUnpricedRows: true,
      day: requestDay,
    })
    clearDailyAiCostTotalCacheForTesting()
  })

  it('propagates a spend-cap breach from beforeAttempt without ever calling fetch', async () => {
    const { subject } = await buildSubject()
    const breach: OpenAiSpendCapBreach = {
      reason: 'cap_exceeded',
      totalMicrounits: 20_000_000,
      dailyCapMicrounits: 10_000_000,
      day: '2026-01-01',
    }
    const hooks = createAutotaggerStructuredDecisionHooks(subject, {
      assertOpenAiSpendCapNotBreached: async () => breach,
    })
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
    const { subject } = await buildSubject()
    const fetch = vi.fn<StructuredDecisionFetch>().mockResolvedValue(jsonResponse({}, 500))
    const key = getAccountingUncertaintyKey(day)

    try {
      await expect(noBreachClient(subject, fetch).decide(request)).rejects.toMatchObject({
        code: 'provider-error',
      })
      await expect(getAccountingUncertaintySource(day)).resolves.toBe('unknown_billed_attempt')
    } finally {
      await dynamicConfigPrimaryValkeyClient.unlink([key])
    }
  })
})
