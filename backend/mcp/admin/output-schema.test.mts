import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { findSchemaViolation } from '@vouchington/mcp-server/schema'
import {
  insertTestCrawler,
  insertTestReportIntegrityFlag,
  insertTestUrlHostname,
  insertTestVoteIntegrityFlag,
} from '@voucha/test-helpers'
import { searchCrawlers } from '@services/crawlers'
import { getReportIntegrityFlags } from '@services/report-integrity'
import { getVoteIntegrityFlags } from '@services/vote-integrity'
import { adminRouteOutputSchema } from './output-schema.mts'

describe('admin hostname output contracts', () => {
  it('accepts the crawler listing with the natural hostname fact', async () => {
    const hostname = `mcp-crawler-${randomBytes(8).toString('hex')}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const crawlerId = await insertTestCrawler({ hostnameId, description: 'MCP hostname output' })
    const page = await searchCrawlers({ limit: 100 })
    expect(page.results.find(crawler => crawler.id === crawlerId)?.hostname).toBe(hostname)
    const schema = adminRouteOutputSchema({ method: 'GET', path: '/api/v1/crawlers' })
    expect(findSchemaViolation(schema, JSON.parse(JSON.stringify(page)))).toBeNull()
  })

  it('accepts both integrity flag listings with hostname facts', async () => {
    const hostname = `mcp-integrity-${randomBytes(8).toString('hex')}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const reportId = await insertTestReportIntegrityFlag({ hostnameId })
    const voteId = await insertTestVoteIntegrityFlag({ hostnameId })
    const reportPage = await getReportIntegrityFlags({ ids: [reportId] })
    const votePage = await getVoteIntegrityFlags({ ids: [voteId] })
    expect(reportPage.results[0]?.hostname).toBe(hostname)
    expect(votePage.results[0]?.hostname).toBe(hostname)
    expect(
      findSchemaViolation(
        adminRouteOutputSchema({ method: 'GET', path: '/api/v1/report-integrity/flags' }),
        JSON.parse(JSON.stringify(reportPage)),
      ),
    ).toBeNull()
    expect(
      findSchemaViolation(
        adminRouteOutputSchema({ method: 'GET', path: '/api/v1/vote-integrity/flags' }),
        JSON.parse(JSON.stringify(votePage)),
      ),
    ).toBeNull()
  })
})
