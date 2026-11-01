import { createServer, type ServerResponse } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Context } from '@jongleberry/api-server'
import type { ApiScope } from '@modules/scopes'
import { USER_MCP_SERVER_CONFIG, type McpCallAuditEvent } from '@services/mcp-tools'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import { createTestUser, overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers'
import {
  readApiUsageRows,
  startLocalAnalyticsForTest,
} from '@voucha/test-helpers/api-usage-analytics'
import { closeScopedDynamicConfigContext } from '@voucha/test-helpers/dynamic-config'
import { settleMeteredMcpResponses } from '@voucha/test-helpers/mcp-usage-meter'
import { startMcpUsageMeter, type McpUsageMeter } from './mcp-usage-helpers.mts'

const scopes: ApiScope[] = []

const call = (outcome: McpCallAuditEvent['outcome']): McpCallAuditEvent => ({
  jsonrpcMethod: 'tools/call',
  toolName: 'withdraw_entity_relation_vote',
  outcome,
})

function contextFor(res: ServerResponse): Context {
  return { res } as Context
}

async function unitsFor(
  statusCode: number,
  prepare: (meter: McpUsageMeter) => void,
): Promise<number> {
  const owner = await createTestUser()
  let failure: unknown
  const server = createServer((_req, res) => {
    try {
      const meter = startMcpUsageMeter(contextFor(res), USER_MCP_SERVER_CONFIG, {
        status: 'authenticated',
        owner,
        scopes,
        suspended: false,
        credential: 'api_key',
        oauthClientId: null,
        apiKeyId: owner.id,
        rateLimitIdentity: { apiKeyId: owner.id },
      })
      prepare(meter)
      res.statusCode = statusCode
      res.setHeader('content-type', 'application/json')
      res.end('{}')
    } catch (err) {
      failure = err
      res.statusCode = 500
      res.end()
    }
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  try {
    const address = server.address()
    if (address === null || typeof address === 'string') {
      throw new Error('MCP message meter probe is not listening')
    }
    await settleMeteredMcpResponses(async () => {
      const response = await fetch(`http://127.0.0.1:${address.port}/`)
      await response.arrayBuffer()
    })
    if (failure instanceof Error) throw failure
    if (failure !== undefined) throw new Error('MCP message meter probe failed')
    const [row, ...rest] = await readApiUsageRows(owner.id)
    expect(rest).toEqual([])
    return Number(row?.units)
  } finally {
    await new Promise<void>(resolve => {
      server.close(() => resolve())
    })
  }
}

describe('MCP message usage meter', () => {
  let stopLocalAnalytics: () => Promise<void>
  let originalConfig: ReturnType<typeof routeRateLimitConfig.getFields>

  beforeAll(async () => {
    stopLocalAnalytics = await startLocalAnalyticsForTest('mcp-message-meter-')
    await routeRateLimitConfig.waitForInitialization()
    routeRateLimitConfig.unsubscribe()
    originalConfig = routeRateLimitConfig.getFields()
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
  })

  afterAll(async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, originalConfig)
    await closeScopedDynamicConfigContext([routeRateLimitConfig])
    await stopLocalAnalytics()
  })

  it('settles only when every message index was refused, including a late refusal', async () => {
    const events = [call('rate_limited'), call('accepted')]

    await expect(unitsFor(200, meter => meter.recordPlannedEvents(events))).resolves.toBe(1)
    await expect(
      unitsFor(200, meter => {
        meter.recordPlannedEvents(events)
        meter.markRateLimited(1)
      }),
    ).resolves.toBe(0)
    await expect(
      unitsFor(429, meter => {
        meter.recordPlannedEvents(events)
        meter.markRateLimited(1)
      }),
    ).resolves.toBe(0)
  })

  it('keeps mixed messages charged even when a request id is reused', async () => {
    await expect(
      unitsFor(200, meter => {
        // The two calls may have the same JSON-RPC id; the meter tracks their positions.
        meter.recordPlannedEvents([call('accepted'), call('rate_limited')])
        meter.markRateLimited(1)
      }),
    ).resolves.toBe(1)
  })

  it('ignores invalid callback indexes without revoking a wholly refused batch', async () => {
    await expect(
      unitsFor(200, meter => {
        meter.recordPlannedEvents([call('rate_limited')])
        meter.markRateLimited(-1)
        meter.markRateLimited(1)
      }),
    ).resolves.toBe(0)
  })

  it('keeps a tools/list or notification message charged', async () => {
    await expect(
      unitsFor(200, meter => {
        meter.recordPlannedEvents([
          call('rate_limited'),
          { jsonrpcMethod: 'tools/list', toolName: null, outcome: 'accepted' },
          { jsonrpcMethod: 'notifications/initialized', toolName: null, outcome: 'accepted' },
        ])
      }),
    ).resolves.toBe(1)
  })

  it('does not treat an unplanned request as wholly refused', async () => {
    await expect(unitsFor(200, () => undefined)).resolves.toBe(1)
  })
})
