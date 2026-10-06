/**
 * An actual 5xx on POST /api/v1/mcp is the API's failure, so it is reported with zero billable
 * units and never charged to the caller's usage quota. The 503 comes from the fail-closed audit log,
 * the one place this route raises a server error before the call runs.
 */
import { ServerResponse } from 'node:http'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  readApiUsageRows,
  startLocalAnalyticsForTest,
} from '@voucha/test-helpers/api-usage-analytics'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  issueTestUserMcpCredential,
  type UserMcpCredentialKind,
} from '@voucha/test-helpers/mcp-user-credentials'
import * as routeRateLimits from '@services/route-rate-limits'
import * as audit from './audit.mts'

function trackClosedUsageSettlement(): Promise<void>[] {
  const settled: Promise<unknown>[] = []
  const settleUsage = routeRateLimits.settleUsage
  vi.spyOn(routeRateLimits, 'settleUsage').mockImplementation(settlement => {
    const result = settleUsage(settlement)
    settled.push(result)
    return result
  })
  const once = ServerResponse.prototype.once
  const closed: Promise<void>[] = []
  vi.spyOn(ServerResponse.prototype, 'once').mockImplementation(function (
    this: ServerResponse,
    event: string,
    listener: (...args: unknown[]) => void,
  ) {
    if (event !== 'close') return once.call(this, event, listener)
    const done = Promise.withResolvers<void>()
    closed.push(done.promise)
    return once.call(this, event, (...args: unknown[]) => {
      listener(...args)
      void Promise.all(settled).then(
        () => done.resolve(),
        () => done.resolve(),
      )
    })
  })
  return closed
}

describe.each<UserMcpCredentialKind>(['oauth', 'api_key'])(
  'POST /api/v1/mcp usage with an %s credential on a server error',
  kind => {
    let stopLocalAnalytics: () => Promise<void>

    beforeAll(async () => {
      stopLocalAnalytics = await startLocalAnalyticsForTest('mcp-usage-failure-test-')
    })

    afterEach(() => vi.restoreAllMocks())

    afterAll(() => stopLocalAnalytics())

    it('reports the 503 with zero units', async () => {
      const { user, token } = await issueTestUserMcpCredential(kind, 'mcp.user:read')
      vi.spyOn(audit, 'recordMcpCallAudit').mockRejectedValueOnce(new Error('audit storage down'))
      const closed = trackClosedUsageSettlement()

      await createRequest()
        .post('/api/v1/mcp')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${token}`)
        .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
        .expect(503)
      await Promise.all(closed)

      const rows = await readApiUsageRows(user.id)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ credential: kind, user_id: user.id, status_code: 503 })
      expect(Number(rows[0]!.units)).toBe(0)
    })
  },
)
