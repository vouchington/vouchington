import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestReportIntegrityFlag } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { runWithCredentialRequestContext } from '@modules/request-client-info'
import { getRegisteredToolByName } from '@voucha/mcp/registry/index'

const MCP_ORIGIN = {
  interface: 'mcp' as const,
  credential: 'api_key' as const,
  client: null,
  oauthClientId: null,
}

describe('read_report_integrity flag option', () => {
  it('returns the same flag detail as REST, including the reporter ids', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser()
    const reporter = await createTestUser()
    const flagId = await insertTestReportIntegrityFlag({
      reportedUserId: target.id,
      reporterCount: 1,
      reporterUserIds: [reporter.id],
    })
    const request = createRequest()
    await request.authenticateAs(admin)

    const rest = await request.get(`/api/v1/report-integrity/flags/${flagId}`)
    const tool = getRegisteredToolByName('read_report_integrity')!
    const mcp = await runWithCredentialRequestContext(MCP_ORIGIN, () =>
      tool.function(admin)({ option: 'flag', arguments: { id: flagId } }),
    )

    expect(rest.status).toBe(200)
    expect(rest.body.flag.details.reporter_user_ids).toEqual([reporter.id])
    expect(JSON.stringify(mcp)).toContain(flagId)
    expect(JSON.stringify(mcp)).toContain(reporter.id)
  })

  it('returns 404 for an unknown flag', async () => {
    const admin = await createTestUser({ administrator: true })
    const tool = getRegisteredToolByName('read_report_integrity')!
    await expect(
      runWithCredentialRequestContext(MCP_ORIGIN, () =>
        tool.function(admin)({ option: 'flag', arguments: { id: crypto.randomUUID() } }),
      ),
    ).rejects.toMatchObject({ status: 404 })
  })
})
