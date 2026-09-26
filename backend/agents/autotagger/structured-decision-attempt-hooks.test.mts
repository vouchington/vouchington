import { randomUUID } from 'node:crypto'
import { Response } from 'undici'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestFutureUtcDay,
  createTestPost,
  createTestUser,
  findAiUsageRecordForAgent,
  findAiUsageRecordForPost,
  pollUntilNotNull,
} from '@voucha/test-helpers'
import {
  createStructuredDecisionClient,
  type StructuredDecisionFetch,
  type StructuredDecisionRequest,
} from '@modules/structured-decisions'
import type { AutotaggerReceiptSubject } from '@services/autotagger'
import { createAutotaggerStructuredDecisionHooks } from './structured-decision-attempt-hooks.mts'

const AGENT_SLUG = 'autotagger'

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

// createStructuredDecisionSpendHooks's own test
// (backend/agents/_shared/structured-decision-spend-hooks.test.mts) already proves the ledger/cap/
// latch mechanism generically. This only proves autotagger's WIRING onto it (issue #616): that
// createAutotaggerStructuredDecisionHooks maps a post subject to `postId` attribution, and an RSS
// feed item subject to no attribution (rssFeedItemId is not an ai_usage_records column).
describe('createAutotaggerStructuredDecisionHooks', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('attributes a post-subject decision to that post', async () => {
    vi.setSystemTime(new Date(`${createTestFutureUtcDay()}T12:00:00.000Z`))
    const user = await createTestUser()
    const post = await createTestPost({ user })
    const subject: AutotaggerReceiptSubject = { postId: post.id, rssFeedItemId: null }
    const body = makeDecisionBody()
    const fetch = vi
      .fn<StructuredDecisionFetch>()
      .mockImplementation(async () => jsonResponse(body))

    await noBreachClient(subject, fetch).decide(request)

    const record = await pollUntilNotNull(() => findAiUsageRecordForPost(post.id, AGENT_SLUG))
    expect(record).toMatchObject({ pricing_status: 'priced', input_tokens: 12, output_tokens: 3 })
  })

  it('records an RSS-feed-item-subject decision under the agent slug with no post attribution', async () => {
    vi.setSystemTime(new Date(`${createTestFutureUtcDay()}T12:00:00.000Z`))
    const subject: AutotaggerReceiptSubject = {
      postId: null,
      rssFeedItemId: randomUUID(),
    }
    const body = makeDecisionBody({ usage: { input_tokens: 17, output_tokens: 4, cost: 0.001 } })
    const fetch = vi
      .fn<StructuredDecisionFetch>()
      .mockImplementation(async () => jsonResponse(body))

    await noBreachClient(subject, fetch).decide(request)

    const record = await pollUntilNotNull(() =>
      findAiUsageRecordForAgent(AGENT_SLUG, { inputTokens: 17, outputTokens: 4 }),
    )
    expect(record?.community_id).toBeNull()
  })
})
