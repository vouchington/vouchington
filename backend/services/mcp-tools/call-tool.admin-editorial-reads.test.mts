import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  createTestLandingPage,
  createTestLandingPageProfileLinkItem,
  insertTestUrlHostname,
  insertTestReferralProgram,
} from '@voucha/test-helpers'
import { readStaffActionHistory } from '@voucha/test-helpers/staff-action-history'
import { callMcpTool } from './call-tool.mts'
import { ADMIN_MCP_SERVER_CONFIG } from './config.mts'

describe('registered admin read projections', () => {
  it('reads owned import progress, categories and landing-page analytics without audit writes', async () => {
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUser()
    const page = await createTestLandingPage(user.id, 'Synthetic staff analytics page')
    await createTestLandingPageProfileLinkItem(user.id, page.landingPageId)
    const invoke = (name: string, args: unknown) =>
      callMcpTool(
        name,
        args,
        { ...admin, membership_plan: null },
        ['editorial:read', 'editorial:write'],
        ADMIN_MCP_SERVER_CONFIG,
      )
    const imported = await invoke('import_topics', {
      csv: `slug,name\nread-${randomUUID()},Read fixture`,
    })
    expect(imported.isError).not.toBe(true)
    const batch = imported.structuredContent!['batch'] as { id: string }
    const history = await readStaffActionHistory(admin.id)
    const result = await invoke('get_import_batch', { batch_id: batch.id })
    expect(result).not.toMatchObject({ isError: true })
    expect(result.structuredContent).toMatchObject({
      batch: { id: batch.id, total_rows: 1 },
      rows: [expect.objectContaining({ batch_id: batch.id })],
    })
    expect(result.structuredContent).toHaveProperty('progress')
    for (const row of result.structuredContent!['rows'] as Record<string, unknown>[]) {
      expect(row).not.toHaveProperty('topic_id')
      expect(row).not.toHaveProperty('rss_feed_id')
    }
    const categories = await invoke('list_unmapped_rss_categories', { status: 'all', limit: 1 })
    expect(categories.isError).not.toBe(true)
    const pages = await invoke('list_user_landing_pages', { user_id: user.id, limit: 1 })
    expect(pages.isError).not.toBe(true)
    expect(JSON.stringify(pages.structuredContent)).toContain(page.landingPageId)
    const analytics = await invoke('get_landing_page_analytics', { page_id: page.landingPageId })
    expect(analytics.isError).not.toBe(true)
    expect(analytics.structuredContent).toMatchObject({
      landing_page: { id: page.landingPageId },
      analytics: { conversion_funnel: { total_signups: 0 } },
    })
    expect(await readStaffActionHistory(admin.id)).toEqual(history)
  })

  it('reads a crawler consistently through both selectors and the bounded search', async () => {
    const admin = await createTestUser({ administrator: true })
    const hostnameId = await insertTestUrlHostname({ hostname: `${randomUUID()}.example.com` })
    const referralId = await insertTestReferralProgram({ createdById: admin.id })
    const invoke = (name: string, args: unknown) =>
      callMcpTool(
        name,
        args,
        { ...admin, membership_plan: null },
        ['editorial:read', 'editorial:write'],
        ADMIN_MCP_SERVER_CONFIG,
      )
    const created = await invoke('set_referral_program_crawler', {
      hostname_id: hostnameId,
      referral_program_id: referralId,
    })
    expect(created.isError).not.toBe(true)
    const crawler = created.structuredContent!['crawler'] as { id: string }
    const before = await readStaffActionHistory(admin.id)
    for (const args of [{ hostname_id: hostnameId }, { referral_program_id: referralId }]) {
      const listed = await invoke('list_crawlers', args)
      expect(listed.isError).not.toBe(true)
      expect(listed.structuredContent).toMatchObject({
        results: [expect.objectContaining({ id: crawler.id })],
      })
    }
    const searched = await invoke('list_crawlers', { limit: 1 })
    expect(searched.isError).not.toBe(true)
    const fetched = await invoke('get_crawler', { id: crawler.id })
    expect(fetched.isError).not.toBe(true)
    expect(fetched.structuredContent).toMatchObject({ crawler: { id: crawler.id } })
    expect(await readStaffActionHistory(admin.id)).toEqual(before)
  })
})
