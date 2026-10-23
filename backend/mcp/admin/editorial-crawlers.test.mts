import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestCrawler, insertTestUrlHostname } from '@voucha/test-helpers'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import { mergeTopicForTest, softDeleteTopic } from '@voucha/test-helpers/entities/topics/deletion'
import { createRequest } from '@voucha/test-helpers/api/server'
import { runWithCredentialRequestContext } from '@modules/request-client-info'
import { getRegisteredToolByName } from '@voucha/mcp/registry/index'

const MCP_ORIGIN = {
  interface: 'mcp' as const,
  credential: 'api_key' as const,
  client: null,
  oauthClientId: null,
}

describe('update_crawler topic references', () => {
  it('returns 404 through REST and MCP for a nonexistent referral_program_id', async () => {
    const admin = await createTestUser({ administrator: true })
    const hostnameId = await insertTestUrlHostname({
      hostname: `crawler-topic-missing-${crypto.randomUUID()}.example.com`,
    })
    const crawlerId = await insertTestCrawler({ hostnameId, description: 'Missing topic baseline' })
    const missingTopicId = crypto.randomUUID()
    const request = createRequest()
    await request.authenticateAs(admin)

    const rest = await request
      .patch(`/api/v1/crawlers/${crawlerId}`)
      .set('Content-Type', 'application/json')
      .send({ referral_program_id: missingTopicId })

    const tool = getRegisteredToolByName('update_crawler')!
    const mcp = runWithCredentialRequestContext(MCP_ORIGIN, () =>
      tool.function(admin)({ id: crawlerId, updates: { referral_program_id: missingTopicId } }),
    )

    expect(rest.status).toBe(404)
    await expect(mcp).rejects.toMatchObject({ status: 404, message: 'Topic not found' })
  })

  it('returns matching REST and MCP errors for a merged source whose destination was deleted', async () => {
    const admin = await createTestUser({ administrator: true })
    const hostnameId = await insertTestUrlHostname({
      hostname: `crawler-topic-merged-${crypto.randomUUID()}.example.com`,
    })
    const crawlerId = await insertTestCrawler({ hostnameId, description: 'Merged topic baseline' })
    const sourceId = await insertTestTopic({
      createdById: admin.id,
      name: `Merged source ${crypto.randomUUID()}`,
      slug: `merged-source-${crypto.randomUUID()}`,
    })
    const destinationId = await insertTestTopic({
      createdById: admin.id,
      name: `Deleted destination ${crypto.randomUUID()}`,
      slug: `deleted-destination-${crypto.randomUUID()}`,
    })
    await mergeTopicForTest(sourceId, destinationId, admin.id)
    await softDeleteTopic(destinationId, admin.id)
    const request = createRequest()
    await request.authenticateAs(admin)

    const rest = await request
      .patch(`/api/v1/crawlers/${crawlerId}`)
      .set('Content-Type', 'application/json')
      .send({ referral_program_id: sourceId })
    const tool = getRegisteredToolByName('update_crawler')!
    const mcp = runWithCredentialRequestContext(MCP_ORIGIN, () =>
      tool.function(admin)({ id: crawlerId, updates: { referral_program_id: sourceId } }),
    )

    expect(rest.status).toBe(409)
    await expect(mcp).rejects.toMatchObject({ status: 409 })
  })
})
