import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { findSchemaViolation } from '@vouchington/mcp-server/schema'
import {
  createTestUser,
  createReferralProgramFixture,
  insertTestCrawler,
  insertTestReportIntegrityFlag,
  insertTestUrlHostname,
  insertTestVoteIntegrityFlag,
} from '@voucha/test-helpers'
import {
  callStructuredMcpTool,
  expectMcpToolFunctionThrows,
  optionArgs,
  type McpContractCaller,
} from '@voucha/test-helpers/mcp-tool-contract'
import { getRegisteredToolByName } from '@voucha/mcp/registry/index'
import { createCrawler } from '@services/crawlers'
import type { ApiScope } from '@modules/scopes'

const CRAWLER_READ = ['editorial:read'] as const
const INTEGRITY_READ = ['account-enforcement:read'] as const
const INTEGRITY_WRITE = ['account-enforcement:read', 'account-enforcement:write'] as const
const INTEGRITY_PENALIZE = ['account-enforcement:read', 'account-enforcement:penalize'] as const

async function invoke(
  caller: McpContractCaller,
  name: string,
  option: string,
  args: Record<string, unknown>,
  scopes: readonly ApiScope[],
): Promise<Record<string, unknown>> {
  const input = optionArgs(option, args)
  const result = await callStructuredMcpTool(caller, name, input, scopes)
  const schema = getRegisteredToolByName(name)!.meta!.selectOutputSchema!(input)!
  expect(findSchemaViolation(schema, result)).toBeNull()
  return result
}

const flag = (result: Record<string, unknown>) => result.flag as Record<string, unknown>

describe('admin MCP hostname output contracts', () => {
  it('lists crawler and integrity flags through their merged handlers', async () => {
    const caller = { ...(await createTestUser({ administrator: true })), membership_plan: null }
    const hostname = `mcp-list-${randomBytes(8).toString('hex')}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const crawlerId = await insertTestCrawler({ hostnameId, description: 'MCP hostname output' })
    const reportId = await insertTestReportIntegrityFlag({ hostnameId })
    const voteId = await insertTestVoteIntegrityFlag({ hostnameId })

    const crawlers = await invoke(
      caller,
      'read_crawler',
      'list',
      { hostname_id: hostnameId },
      CRAWLER_READ,
    )
    expect(
      (crawlers.results as Array<Record<string, unknown>>).find(row => row.id === crawlerId),
    ).toMatchObject({
      hostname_id: hostnameId,
      hostname,
    })
    const unfiltered = await invoke(caller, 'read_crawler', 'list', { limit: 100 }, CRAWLER_READ)
    expect(
      (unfiltered.results as Array<Record<string, unknown>>).find(row => row.id === crawlerId),
    ).toMatchObject({
      hostname_id: hostnameId,
      hostname,
    })
    const detail = await invoke(caller, 'read_crawler', 'get', { id: crawlerId }, CRAWLER_READ)
    expect(detail.crawler).toMatchObject({ id: crawlerId, hostname_id: hostnameId })

    const referral = await createReferralProgramFixture({ createdById: caller.id, hostname })
    const referralCrawler = await createCrawler(null, {
      hostname_id: hostnameId,
      referral_program_id: referral.referralProgramId,
      crawler_type: 'automation',
    })
    const referralList = await invoke(
      caller,
      'read_crawler',
      'list',
      { referral_program_id: referral.referralProgramId },
      CRAWLER_READ,
    )
    expect(
      (referralList.results as Array<Record<string, unknown>>).find(
        row => row.id === referralCrawler.id,
      ),
    ).toMatchObject({
      hostname_id: hostnameId,
      hostname,
    })

    const report = await invoke(
      caller,
      'read_report_integrity',
      'flags',
      { limit: 100 },
      INTEGRITY_READ,
    )
    expect(
      (report.results as Array<Record<string, unknown>>).find(row => row.id === reportId),
    ).toMatchObject({
      hostname_id: hostnameId,
      hostname,
    })

    const vote = await invoke(
      caller,
      'read_vote_integrity',
      'flags',
      { limit: 100 },
      INTEGRITY_READ,
    )
    expect(
      (vote.results as Array<Record<string, unknown>>).find(row => row.id === voteId),
    ).toMatchObject({
      hostname_id: hostnameId,
      hostname,
    })
  })

  it('preserves hostname in both review and penalty handler results', async () => {
    const caller = { ...(await createTestUser({ administrator: true })), membership_plan: null }
    const hostname = `mcp-action-${randomBytes(8).toString('hex')}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const reportReviewId = await insertTestReportIntegrityFlag({ hostnameId })
    const voteReviewId = await insertTestVoteIntegrityFlag({ hostnameId })

    for (const [option, id] of [
      ['report', reportReviewId],
      ['vote', voteReviewId],
    ] as const) {
      const result = await invoke(
        caller,
        'review_integrity_flag',
        option,
        { id, resolution: 'dismissed' },
        INTEGRITY_WRITE,
      )
      expect(flag(result)).toMatchObject({
        id,
        hostname_id: hostnameId,
        hostname,
        resolution: 'dismissed',
      })
    }

    const reportPenaltyId = await insertTestReportIntegrityFlag({ hostnameId })
    const votePenaltyId = await insertTestVoteIntegrityFlag({ hostnameId })
    for (const [option, id] of [
      ['report_abuse', reportPenaltyId],
      ['vote_ring', votePenaltyId],
    ] as const) {
      const result = await invoke(
        caller,
        'apply_integrity_penalty',
        option,
        { id },
        INTEGRITY_PENALIZE,
      )
      expect(flag(result)).toMatchObject({
        id,
        hostname_id: hostnameId,
        hostname,
        resolution: 'penalized',
      })
    }
  })

  it('rejects invalid arguments and missing flags through merged handlers', async () => {
    const caller = { ...(await createTestUser({ administrator: true })), membership_plan: null }
    expect(() =>
      getRegisteredToolByName('read_crawler')!.function(caller)(
        optionArgs('get', { id: 'not-a-uuid' }),
      ),
    ).toThrow('Invalid merged tool arguments')
    await expectMcpToolFunctionThrows(
      caller,
      'review_integrity_flag',
      optionArgs('report', { id: randomUUID(), resolution: 'dismissed' }),
      { status: 404 },
    )
    await expectMcpToolFunctionThrows(
      caller,
      'apply_integrity_penalty',
      optionArgs('vote_ring', { id: randomUUID() }),
      { status: 404 },
    )
  })
})
