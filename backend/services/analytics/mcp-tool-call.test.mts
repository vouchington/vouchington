import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { flush } from '@data-stores/analytics/backend-local'
import { query } from '@data-stores/analytics/query'
import { trackApiUsage } from './api-usage.mts'
import {
  createMcpToolCallAnalytics,
  trackMcpToolCall,
  type McpToolCall,
  type McpToolCallAnalytics,
  type McpToolCallContext,
  type McpToolCallPlanEvent,
  type McpToolCallSettlement,
} from './mcp-tool-call.mts'

const BEARER_TOKEN = 'vch_secret_bearer_token_that_must_never_be_stored'

const dispatch = {
  isDispatched(message: unknown): boolean {
    if (!isRecord(message) || message.method !== 'tools/call') return false
    const { id } = message
    return typeof id === 'string' || (typeof id === 'number' && Number.isInteger(id))
  },
  isNotification(message: unknown): boolean {
    if (!isRecord(message) || message.method !== 'tools/call') return false
    return message.id === undefined || message.id === null
  },
}

function isRecord(message: unknown): message is Record<string, unknown> {
  return typeof message === 'object' && message !== null
}

function context(): McpToolCallContext {
  return {
    audience: 'community_moderation',
    credential: 'oauth',
    userId: crypto.randomUUID(),
    apiKeyId: null,
    oauthClientId: `client-${crypto.randomUUID()}`,
    oauthGrantId: crypto.randomUUID(),
    plan: 'pro',
  }
}

function toolCall(id: string | number): Record<string, unknown> {
  return { method: 'tools/call', id }
}

function event(overrides: Partial<McpToolCallPlanEvent> = {}): McpToolCallPlanEvent {
  return {
    jsonrpcMethod: 'tools/call',
    toolName: 'review_report',
    option: 'dismiss',
    outcome: 'accepted',
    ...overrides,
  }
}

async function rows(requestEventId: string): Promise<Record<string, unknown>[]> {
  await flush()
  const found = await query(
    `SELECT * FROM mcp_tool_call WHERE request_event_id = '${requestEventId}'`,
  )
  return found.toSorted((left, right) => Number(left.batch_index) - Number(right.batch_index))
}

function settle(
  analytics: McpToolCallAnalytics,
  planned: McpToolCallPlanEvent,
  settlement: McpToolCallSettlement,
  message: unknown = toolCall(1),
): Promise<Record<string, unknown>[]> {
  analytics.recordCalls([planned], [message], true)
  analytics.settleDispatchedCall(0, settlement)
  analytics.settleDispatchedCall(0, settlement)
  return rows(analytics.requestEventId)
}

describe('mcp_tool_call', () => {
  let testDir: string

  beforeAll(async () => {
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'analytics-mcp-tool-call-test-'))
    process.env.ANALYTICS_LOCAL_DIR = testDir
    process.env.ANALYTICS_BACKEND = 'local'
  })

  afterAll(async () => {
    await fs.promises.rm(testDir, { recursive: true })
  })

  it('stores only the closed column set', async () => {
    const call: McpToolCall = {
      audience: 'user',
      credential: 'api_key',
      user_id: crypto.randomUUID(),
      api_key_id: crypto.randomUUID(),
      oauth_client_id: null,
      oauth_grant_id: null,
      plan: 'free',
      request_event_id: crypto.randomUUID(),
      batch_size: 1,
      batch_index: 0,
      tool: 'lookup_entity',
      option: null,
      jsonrpc_method: 'tools/call',
      outcome: 'accepted',
      duration_ms: 3,
    }
    trackMcpToolCall({ ...call, authorization: `Bearer ${BEARER_TOKEN}` } as McpToolCall)
    await flush()

    const [row] = await query(`SELECT * FROM mcp_tool_call WHERE user_id = '${call.user_id}'`)

    expect(Object.keys(row!).toSorted()).toEqual(
      [
        'api_key_id',
        'audience',
        'batch_index',
        'batch_size',
        'credential',
        'duration_ms',
        'env',
        'event_date',
        'event_id',
        'event_time',
        'jsonrpc_method',
        'oauth_client_id',
        'oauth_grant_id',
        'option',
        'outcome',
        'plan',
        'request_event_id',
        'tool',
        'user_id',
      ].toSorted(),
    )
    expect(
      JSON.stringify(row, (_key, value) => (typeof value === 'bigint' ? 0 : value)),
    ).not.toContain(BEARER_TOKEN)
  })

  it('records one accepted call with its tool, option, and duration', async () => {
    const analytics = createMcpToolCallAnalytics(context(), dispatch)
    const [row] = await settle(analytics, event(), {
      durationMs: 12,
      toolError: false,
      rateLimited: false,
    })

    expect(row).toMatchObject({
      tool: 'review_report',
      option: 'dismiss',
      outcome: 'accepted',
      jsonrpc_method: 'tools/call',
      audience: 'community_moderation',
      credential: 'oauth',
      plan: 'pro',
    })
    expect(Number(row!.duration_ms)).toBe(12)
    expect(Number(row!.batch_size)).toBe(1)
    expect(Number(row!.batch_index)).toBe(0)
  })

  it('keeps a planned denial when the tool function never ran', async () => {
    const analytics = createMcpToolCallAnalytics(context(), dispatch)
    const [denied] = await settle(analytics, event({ outcome: 'insufficient_scope' }), {
      durationMs: null,
      toolError: false,
      rateLimited: false,
    })
    const invalid = createMcpToolCallAnalytics(context(), dispatch)
    const [badArgs] = await settle(
      invalid,
      event({ outcome: 'invalid_arguments', option: undefined }),
      {
        durationMs: null,
        toolError: false,
        rateLimited: false,
      },
    )

    expect(denied!.outcome).toBe('insufficient_scope')
    expect(denied!.duration_ms ?? null).toBeNull()
    expect(badArgs!.outcome).toBe('invalid_arguments')
    expect(badArgs!.option ?? null).toBeNull()
    expect(badArgs!.duration_ms ?? null).toBeNull()
  })

  it('records a handler error once, as tool_error', async () => {
    const analytics = createMcpToolCallAnalytics(context(), dispatch)
    const recorded = await settle(analytics, event(), {
      durationMs: 4,
      toolError: true,
      rateLimited: false,
    })

    expect(recorded).toHaveLength(1)
    expect(recorded[0]!.outcome).toBe('tool_error')
    expect(Number(recorded[0]!.duration_ms)).toBe(4)
  })

  it('records a rate-limited call that never ran', async () => {
    const analytics = createMcpToolCallAnalytics(context(), dispatch)
    const [row] = await settle(analytics, event(), {
      durationMs: null,
      toolError: false,
      rateLimited: true,
    })

    expect(row!.outcome).toBe('rate_limited')
    expect(row!.duration_ms ?? null).toBeNull()
  })

  it('numbers a batch from the shared request event id', async () => {
    const owner = context()
    const analytics = createMcpToolCallAnalytics(owner, dispatch)
    const planned = [0, 1, 2].map(index =>
      event({ toolName: `tool_${index}`, option: index === 1 ? 'merged' : undefined }),
    )
    analytics.recordCalls(
      planned,
      planned.map((_, index) => toolCall(index)),
      true,
    )
    planned.forEach((_, index) => {
      analytics.settleDispatchedCall(index, {
        durationMs: index,
        toolError: false,
        rateLimited: false,
      })
    })
    trackApiUsage(
      {
        surface: 'mcp_user',
        credential: 'oauth',
        user_id: owner.userId,
        oauth_client_id: owner.oauthClientId ?? undefined,
        oauth_grant_id: owner.oauthGrantId ?? undefined,
        plan: 'pro',
        scope_class: 'read',
        unit: 'request',
        units: 3,
        status_code: 200,
        quota_limit: 900,
        duration_ms: 8,
      },
      analytics.requestEventId,
    )

    const recorded = await rows(analytics.requestEventId)
    const [usage] = await query(`SELECT * FROM api_usage WHERE user_id = '${owner.userId}'`)

    expect(recorded.map(row => Number(row.batch_index))).toEqual([0, 1, 2])
    expect(new Set(recorded.map(row => row.request_event_id)).size).toBe(1)
    expect(recorded.every(row => Number(row.batch_size) === 3)).toBe(true)
    expect(usage!.event_id).toBe(analytics.requestEventId)
    expect(recorded[1]!.option).toBe('merged')
    expect(recorded[0]!.option ?? null).toBeNull()
  })

  it('emits nothing for a notification-shaped tools/call', async () => {
    const analytics = createMcpToolCallAnalytics(context(), dispatch)
    analytics.recordCalls(
      [event({ toolName: 'hidden' }), event({ toolName: 'shown' })],
      [{ method: 'tools/call' }, toolCall('shown')],
      true,
    )
    analytics.settleDispatchedCall(0, { durationMs: 5, toolError: false, rateLimited: false })
    analytics.settleDispatchedCall(1, { durationMs: 9, toolError: false, rateLimited: false })

    const recorded = await rows(analytics.requestEventId)

    expect(recorded.map(row => row.tool)).toEqual(['shown'])
    expect(Number(recorded[0]!.batch_index)).toBe(1)
    expect(Number(recorded[0]!.duration_ms)).toBe(9)
  })

  it('emits immediately when the handler will not run', async () => {
    const analytics = createMcpToolCallAnalytics(context(), dispatch)
    analytics.recordCalls([event({ outcome: 'insufficient_scope' })], [toolCall(1)], false)

    const recorded = await rows(analytics.requestEventId)

    expect(recorded).toHaveLength(1)
    expect(recorded[0]!.outcome).toBe('insufficient_scope')
    expect(recorded[0]!.duration_ms ?? null).toBeNull()
  })
})
