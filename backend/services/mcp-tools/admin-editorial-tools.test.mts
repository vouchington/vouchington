import { randomUUID } from 'node:crypto'
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  createTestTopic,
  insertTestUrlHostname,
  insertTestReferralProgram,
} from '@voucha/test-helpers'
import { readStaffActionHistory } from '@voucha/test-helpers/staff-action-history'
import {
  readStaffCategoryState,
  readStaffEditorialRows,
} from '@voucha/test-helpers/staff-editorial-history'
import type { PrivateUser } from '@services/users/types'
import { callMcpTool } from './call-tool.mts'
import { ADMIN_MCP_SERVER_CONFIG } from './config.mts'

const invoke = (admin: PrivateUser, name: string, args: unknown) =>
  callMcpTool(
    name,
    args,
    { ...admin, membership_plan: null },
    ['editorial:read', 'editorial:write'],
    ADMIN_MCP_SERVER_CONFIG,
  )
function expectError(result: Awaited<ReturnType<typeof invoke>>, status: number): void {
  expect(result.isError).toBe(true)
  const block = result.content[0]!
  expect(block.type).toBe('text')
  if (block.type !== 'text') throw new Error('Expected typed domain error')
  expect(JSON.parse(block.text)).toMatchObject({ error: { status, retryable: false } })
}

describe('registered editorial writes', () => {
  it('creates and updates a referral crawler with history and guard failures', async () => {
    const admin = await createTestUser({ administrator: true })
    const hostnameId = await insertTestUrlHostname({ hostname: `${randomUUID()}.example.com` })
    const referralId = await insertTestReferralProgram({ createdById: admin.id })
    const created = await invoke(admin, 'set_referral_program_crawler', {
      hostname_id: hostnameId,
      referral_program_id: referralId,
      crawler_type: 'fetch',
    })
    expect(created.isError).not.toBe(true)
    const crawler = created.structuredContent!['crawler'] as { id: string }
    expect(
      (
        await invoke(admin, 'update_crawler', {
          id: crawler.id,
          updates: { description: 'Edited crawler description.' },
        })
      ).isError,
    ).not.toBe(true)
    expect((await readStaffEditorialRows(admin.id)).crawlers).toEqual([
      expect.objectContaining({ id: crawler.id, description: 'Edited crawler description.' }),
    ])
    const history = await readStaffActionHistory(admin.id)
    expect(history.map(row => row.action_type)).toEqual(['crawler_create', 'crawler_update'])
    expectError(
      await invoke(admin, 'update_crawler', {
        id: randomUUID(),
        updates: { description: 'Changed' },
      }),
      404,
    )
    await expect(
      invoke(admin, 'set_referral_program_crawler', {
        hostname_id: hostnameId,
        referral_program_id: referralId,
        crawler_type: 'invalid',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.InvalidParams })
    expect(await readStaffActionHistory(admin.id)).toEqual(history)
    expect((await readStaffEditorialRows(admin.id)).crawlers).toHaveLength(1)
  })

  it('rejects and restores RSS categories with history and semantic validation', async () => {
    const admin = await createTestUser({ administrator: true })
    const category = `category-${randomUUID()}`
    expect(
      (await invoke(admin, 'reject_rss_category', { category_text: category })).isError,
    ).not.toBe(true)
    expect(await readStaffCategoryState(category)).toMatchObject({ rejected: true })
    expect(
      (await invoke(admin, 'restore_rss_category', { category_text: category })).isError,
    ).not.toBe(true)
    expect(await readStaffCategoryState(category)).toMatchObject({ rejected: false })
    const history = await readStaffActionHistory(admin.id)
    expect(history.map(row => row.action_type)).toEqual([
      'rss_category_reject',
      'rss_category_unreject',
    ])
    for (const name of ['reject_rss_category', 'restore_rss_category'])
      expectError(await invoke(admin, name, { category_text: ' ' }), 422)
    expect(await readStaffActionHistory(admin.id)).toEqual(history)
    expect(await readStaffCategoryState(category)).toMatchObject({ rejected: false })
  })

  it('assigns a category to a topic with history and rejects unknown topics', async () => {
    const admin = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user: admin })
    const category = `assigned-${randomUUID()}`
    expect(
      (
        await invoke(admin, 'assign_rss_category_to_topic', {
          category_text: category,
          topic_id: topic.id,
        })
      ).isError,
    ).not.toBe(true)
    const state = await readStaffCategoryState(category)
    expect(state).toMatchObject({ alias: { topic_id: topic.id } })
    const history = await readStaffActionHistory(admin.id)
    expect(history).toEqual([expect.objectContaining({ action_type: 'rss_category_assign' })])
    expectError(
      await invoke(admin, 'assign_rss_category_to_topic', {
        category_text: category,
        topic_id: randomUUID(),
      }),
      404,
    )
    expect(await readStaffCategoryState(category)).toEqual(state)
    expect(await readStaffActionHistory(admin.id)).toEqual(history)
  })
})
