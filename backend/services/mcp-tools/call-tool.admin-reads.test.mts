import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createStaffResolutionFixture } from '@voucha/test-helpers/staff-resolution-history'
import { readStaffActionHistory } from '@voucha/test-helpers/staff-action-history'
import { createCopyrightNoticeSchemaFixture } from '@voucha/test-helpers/data-stores/psql/copyright-notice-schema'
import { readCopyrightStaffQueueCursorBefore } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { encodeScopedUuidCursor } from '@modules/pagination'
import type { PrivateUser } from '@services/users/types'
import { callMcpTool } from './call-tool.mts'
import { ADMIN_MCP_SERVER_CONFIG } from './config.mts'

const invoke = (user: PrivateUser, name: string, args: unknown) =>
  callMcpTool(
    name,
    args,
    { ...user, membership_plan: null },
    ['analytics:read', 'copyright-notices:read', 'moderation:read'],
    ADMIN_MCP_SERVER_CONFIG,
  )

async function success(user: PrivateUser, name: string, args: unknown) {
  const result = await invoke(user, name, args)
  expect(result).not.toMatchObject({ isError: true })
  expect(result.structuredContent).toBeDefined()
  return result.structuredContent!
}

async function error(user: PrivateUser, name: string, args: unknown, status: number) {
  const result = await invoke(user, name, args)
  expect(result.isError).toBe(true)
  const block = result.content[0]!
  if (block.type !== 'text') throw new Error('Expected a typed domain error')
  expect(JSON.parse(block.text)).toMatchObject({ error: { status, retryable: false } })
}

describe('registered administrative business reads', () => {
  it('returns growth, bounded AI costs and managed queue projections without staff writes', async () => {
    const admin = await createTestUser({ administrator: true })
    const growth = await success(admin, 'get_growth_metrics', { range: 'today' })
    expect(growth).toMatchObject({
      range: 'today',
      period_start: expect.any(String),
      period_end: expect.any(String),
      user_growth: expect.any(Object),
      content_production: expect.any(Object),
      infrastructure: expect.any(Object),
    })
    const costs = await success(admin, 'get_ai_costs', { limit: 1 })
    expect(costs).toMatchObject({
      results: expect.any(Array),
      page_info: { has_next_page: expect.any(Boolean) },
    })
    expect((costs['results'] as unknown[]).length).toBeLessThanOrEqual(1)
    await error(admin, 'get_ai_costs', { after: 'invalid-cursor' }, 400)
    const queues = await success(admin, 'get_queue_stats', {})
    expect(queues).toMatchObject({ stats: expect.any(Object) })
    expect(await readStaffActionHistory(admin.id)).toEqual([])
  })
})

describe('registered copyright reads', () => {
  it('reads an owned public notice, repeat accounts and a scoped queue page without writes', async () => {
    const admin = await createTestUser({ administrator: true })
    const fixture = await createCopyrightNoticeSchemaFixture()
    const notice = await success(admin, 'get_copyright_notice', { id: fixture.noticeId })
    expect(notice).toMatchObject({ copyright_notice: { id: fixture.noticeId } })
    const accounts = await success(admin, 'list_repeat_infringer_accounts', {
      id: fixture.noticeId,
    })
    expect(accounts).toEqual({ copyright_repeat_infringer_accounts: [] })
    const after = await readCopyrightStaffQueueCursorBefore([fixture.noticeId])
    const queue = await success(admin, 'list_copyright_review_queue', { after, limit: 1 })
    expect(queue).toMatchObject({
      copyright_notices: expect.any(Array),
      page_info: { has_next_page: expect.any(Boolean) },
    })
    expect((queue['copyright_notices'] as unknown[]).length).toBeLessThanOrEqual(1)
    await error(admin, 'get_copyright_notice', { id: randomUUID() }, 404)
    expect(await readStaffActionHistory(admin.id)).toEqual([])
  })
})

describe.each(['appeal', 'dispute'] as const)('registered %s staff reads', kind => {
  it('reads the owned staff projection and a bounded cursor page without writes', async () => {
    const admin = await createTestUser({ administrator: true })
    const { id } = await createStaffResolutionFixture(kind, false)
    const get = kind === 'appeal' ? 'get_moderation_appeal' : 'get_review_dispute'
    const list = kind === 'appeal' ? 'list_moderation_appeals' : 'list_review_disputes'
    const scope =
      kind === 'appeal' ? 'appeals:pending:staff-all:id-desc' : 'disputes:pending:staff:all:id-desc'
    const detail = await success(admin, get, { id })
    const detailProjections = {
      appeal: {
        appeal: {
          id,
          status: 'pending',
          staff_context: expect.any(Object),
          appellant_id: expect.any(String),
          appeal_reason: expect.stringContaining('<external-content'),
        },
      },
      dispute: { dispute: { id, status: 'pending' } },
    }
    expect(detail).toMatchObject(detailProjections[kind])
    const page = await success(admin, list, {
      after: encodeScopedUuidCursor(id, scope),
      limit: 1,
      status: 'pending',
    })
    expect(page).toMatchObject({
      [`${kind}s`]: expect.any(Array),
      page_info: { has_next_page: expect.any(Boolean) },
    })
    const cases = page[`${kind}s`] as { id: string }[]
    expect(cases.length).toBeLessThanOrEqual(1)
    for (const item of cases) expect(item.id.localeCompare(id)).toBeLessThan(0)
    await error(admin, get, { id: randomUUID() }, 404)
    await error(admin, list, { after: encodeScopedUuidCursor(id, `${scope}:wrong-scope`) }, 400)
    expect(await readStaffActionHistory(admin.id)).toEqual([])
  })
})
