import { describe, expect, it, onTestFinished } from 'vitest'
import { userImportExportConfig } from '@services/user-import-export/config'
import { getRegisteredToolByName } from '@voucha/mcp/registry/index'
import { createRequest } from '@voucha/test-helpers/api/server'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  optionArgs,
  type McpContractCaller,
} from '@voucha/test-helpers/mcp-tool-contract'
import { createTestUser, getRssFeedImportFollowForTest } from '@voucha/test-helpers'

const FEED_SCOPES = ['rss-feeds:read', 'rss-feeds:write'] as const
const feedUrl = () => `https://mcp-import-${crypto.randomUUID()}.example.com/feed.xml`
const plus = (user: Awaited<ReturnType<typeof createTestUser>>): McpContractCaller => ({
  ...user,
  membership_plan: 'plus',
})
const importFeeds = (user: McpContractCaller, args: Record<string, unknown>) =>
  callStructuredMcpTool(user, 'submit_rss_feed', optionArgs('import', args), FEED_SCOPES)
const importStatus = (user: McpContractCaller, args: Record<string, unknown>) =>
  callStructuredMcpTool(user, 'submit_rss_feed', optionArgs('import_status', args), FEED_SCOPES)

describe('submit_rss_feed import REST twins — real DB', () => {
  it('imports three URLs with one duplicate and points import at import_status', async () => {
    const user = await createTestPlusMcpCaller()
    const first = feedUrl()
    const second = feedUrl()
    const urls = [first, second, first]
    const request = createRequest()
    await request.authenticateAs(user)
    const rest = await request.post('/api/v1/my/import/rss-feeds').send({ urls }).expect(201)
    const tool = await importFeeds(user, { rss_feed_urls: urls, follow: false })
    expect(rest.body.import).toMatchObject({ total_rows: 2, pending_rows: 2 })
    expect(tool.import).toMatchObject({ total_rows: 2, pending_rows: 2 })
    const restStatus = await request.get(rest.body.status_url).expect(200)
    const toolStatus = await importStatus(user, {
      import_id: (tool.import as { id: string }).id,
    })
    expect(restStatus.body.rows.map((row: { input: string }) => row.input)).toEqual([first, second])
    expect((toolStatus.rows as { input: string }[]).map(row => row.input)).toEqual([first, second])
    const pointers = getRegisteredToolByName('submit_rss_feed')!.meta!.optionOutputPointers!
    expect(pointers.import).not.toBe(pointers.import_status)
  })

  it('rejects 501 URLs the same way REST does', async () => {
    const user = await createTestPlusMcpCaller()
    const urls = Array.from({ length: 501 }, feedUrl)
    const request = createRequest()
    await request.authenticateAs(user)
    await request.post('/api/v1/my/import/rss-feeds').send({ urls }).expect(422)
    await expect(
      callRejectedMcpTool(
        user,
        'submit_rss_feed',
        optionArgs('import', { rss_feed_urls: urls }),
        FEED_SCOPES,
      ),
    ).resolves.toContain('Invalid tool arguments')
  })

  it('denies a free user and rejects a suspended user', async () => {
    const free = plus(await createTestUser())
    free.membership_plan = null
    const suspended = { ...(await createTestPlusMcpCaller()), suspended: true as const }
    const args = optionArgs('import', { rss_feed_urls: [feedUrl()], follow: false })
    await expect(
      callRejectedMcpTool(free, 'submit_rss_feed', args, FEED_SCOPES),
    ).resolves.toContain('higher plan')
    await expect(
      callRejectedMcpTool(suspended, 'submit_rss_feed', args, FEED_SCOPES),
    ).resolves.toBe('suspended')
  })

  it('follows for a normal user and does not follow for an administrator by default', async () => {
    const member = await createTestPlusMcpCaller()
    const admin = await createTestPlusMcpCaller({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(member)
    const restMember = await request
      .post('/api/v1/my/import/rss-feeds')
      .send({ urls: [feedUrl()] })
      .expect(201)
    const toolMember = await importFeeds(member, { rss_feed_urls: [feedUrl()] })
    await request.authenticateAs(admin)
    const restAdmin = await request
      .post('/api/v1/my/import/rss-feeds')
      .send({ urls: [feedUrl()] })
      .expect(201)
    const toolAdmin = await importFeeds(admin, { rss_feed_urls: [feedUrl()] })
    await expect(getRssFeedImportFollowForTest(restMember.body.import.id)).resolves.toBe(true)
    await expect(
      getRssFeedImportFollowForTest((toolMember.import as { id: string }).id),
    ).resolves.toBe(true)
    await expect(getRssFeedImportFollowForTest(restAdmin.body.import.id)).resolves.toBe(false)
    await expect(
      getRssFeedImportFollowForTest((toolAdmin.import as { id: string }).id),
    ).resolves.toBe(false)
  })

  it('pages import_status with after and hides another user import', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(userImportExportConfig, { import_status_page_size: 2 }),
    )
    const owner = await createTestPlusMcpCaller()
    const urls = [feedUrl(), feedUrl(), feedUrl()]
    const created = await importFeeds(owner, { rss_feed_urls: urls, follow: false })
    const importId = (created.import as { id: string }).id
    const request = createRequest()
    await request.authenticateAs(owner)
    const restFirst = await request
      .get(`/api/v1/my/import/rss-feeds/${importId}`)
      .query({ limit: 1000 })
      .expect(200)
    const toolFirst = await importStatus(owner, { import_id: importId, limit: 1000 })
    expect(toolFirst.rows).toEqual(restFirst.body.rows)
    expect(toolFirst.page_info).toEqual(restFirst.body.page_info)
    const after = (toolFirst.page_info as { end_cursor: string }).end_cursor
    const restNext = await request
      .get(`/api/v1/my/import/rss-feeds/${importId}`)
      .query({ after })
      .expect(200)
    const toolNext = await importStatus(owner, { import_id: importId, after })
    expect(toolNext.rows).toEqual(restNext.body.rows)
    expect((toolNext.rows as { input: string }[]).map(row => row.input)).toEqual([urls[2]])
    const stranger = await createTestPlusMcpCaller()
    const text = await callRejectedMcpTool(
      stranger,
      'submit_rss_feed',
      optionArgs('import_status', { import_id: importId }),
      FEED_SCOPES,
    )
    expect(JSON.parse(text)).toMatchObject({
      error: { status: 404, message: 'RSS feed import not found' },
    })
    await request.authenticateAs(stranger)
    await request.get(`/api/v1/my/import/rss-feeds/${importId}`).expect(404)
  })
})
