import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestUrl, insertTestUrlHostname } from '@voucha/test-helpers'
import { callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'

describe('get_domain_ratings database failure', () => {
  it('reports a source lookup failure as a structured error and succeeds on retry', async () => {
    const caller = { ...(await createTestUser()), membership_plan: null }
    const hostname = `ratings-failure-${randomUUID()}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const url = `https://${hostname}/article`
    await insertTestUrl({ url, hostnameId })
    const call = () =>
      callStructuredMcpTool(caller, 'get_domain_ratings', { url }, ['domain-ratings:read'])

    const { result, error } = await withPostgresPoolQueryFailureForTest(
      '/* getRssFeedByUrlId */',
      call,
    )

    expect(result).toEqual({ success: false, error: error.message })
    expect(sentryCaptureExceptionMock.mock.calls.some(([captured]) => captured === error)).toBe(
      true,
    )
    expect(await call()).toMatchObject({
      success: true,
      hostname,
      hostname_id: hostnameId,
      domain_trust: { votes_score_net: 0, votes_count_up: 0, votes_count_down: 0 },
    })
  })
})
