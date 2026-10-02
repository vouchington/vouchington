import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  insertTestModerationReport,
  insertTestReportIntegrityFlag,
  getLatestTestModerationTrainingFeedback,
} from '@voucha/test-helpers'
import {
  readStaffActionHistory,
  readStaffActionTarget,
} from '@voucha/test-helpers/staff-action-history'
import { readStaffEditorialRows } from '@voucha/test-helpers/staff-editorial-history'
import { getPrivateUserByAny } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import { callMcpTool } from './call-tool.mts'
import { ADMIN_MCP_SERVER_CONFIG } from './config.mts'
import { SCOPE_DEFINITIONS, type ApiScope } from '@modules/scopes'

const scopes = Object.keys(SCOPE_DEFINITIONS).filter(
  scope => SCOPE_DEFINITIONS[scope as ApiScope].audience === 'admin',
) as ApiScope[]
const unique = () => `admin-write-${randomBytes(8).toString('hex')}`
const invoke = (admin: PrivateUser, name: string, args: unknown) =>
  callMcpTool(name, args, { ...admin, membership_plan: null }, scopes, ADMIN_MCP_SERVER_CONFIG)

function expectTypedError(result: Awaited<ReturnType<typeof invoke>>, status: number) {
  expect(result.isError).toBe(true)
  const block = result.content[0]!
  expect(block.type).toBe('text')
  if (block.type !== 'text') throw new Error('Expected typed text error')
  expect(JSON.parse(block.text)).toMatchObject({ error: { status, retryable: false } })
}

describe('registered admin MCP writes', () => {
  it('resolves a report with actor history and no agent training evidence', async () => {
    const admin = await createTestUser({ administrator: true })
    const author = await createTestUser()
    const reporter = await createTestUser()
    const postId = await insertTestPost({
      createdById: author.id,
      title: unique(),
      slug: unique(),
      markdown: unique(),
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })
    const result = await invoke(admin, 'resolve_moderation_report', {
      id: reportId,
      status: 'dismissed',
    })
    expect(result.isError).not.toBe(true)
    expect(await readStaffActionTarget('report', reportId)).toMatchObject({
      resolution_action: 'dismissed',
    })
    expect(await readStaffActionHistory(admin.id)).toEqual([
      expect.objectContaining({ action_type: 'dismiss_report', report_id: reportId }),
    ])
    expect(
      await getLatestTestModerationTrainingFeedback({
        postId,
        sourceType: 'moderation_report',
        humanAction: 'report_dismissed',
      }),
    ).toBeUndefined()
    const before = await readStaffActionHistory(admin.id)
    expectTypedError(
      await invoke(admin, 'resolve_moderation_report', { id: reportId, status: 'reviewed' }),
      409,
    )
    expect(await readStaffActionHistory(admin.id)).toEqual(before)
    expect(await readStaffActionTarget('report', reportId)).toMatchObject({
      resolution_action: 'dismissed',
    })
  })

  it('suspends an ordinary account with history and rejects the repeated write', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser()
    expect(
      (await invoke(admin, 'suspend_user', { userId: target.id, reason: unique() })).isError,
    ).not.toBe(true)
    expect((await getPrivateUserByAny(target.id))?.suspended_at).not.toBeNull()
    const history = await readStaffActionHistory(admin.id)
    expect(history).toEqual([
      expect.objectContaining({ action_type: 'suspend', target_user_id: target.id }),
    ])
    expectTypedError(await invoke(admin, 'suspend_user', { userId: target.id }), 409)
    expect(await readStaffActionHistory(admin.id)).toEqual(history)
  })

  it('rejects self and staff suspension without changing either account or history', async () => {
    const admin = await createTestUser({ administrator: true })
    const staff = await createTestUser({ administrator: true })
    for (const target of [admin, staff]) {
      expectTypedError(await invoke(admin, 'suspend_user', { userId: target.id }), 422)
      expect((await getPrivateUserByAny(target.id))?.suspended_at).toBeNull()
    }
    expect(await readStaffActionHistory(admin.id)).toEqual([])
  })

  it('dismisses an integrity flag once with history and leaves it unchanged on retry', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser()
    const id = await insertTestReportIntegrityFlag({ reportedUserId: target.id, reporterCount: 5 })
    expect(
      (await invoke(admin, 'review_report_integrity_flag', { id, resolution: 'dismissed' }))
        .isError,
    ).not.toBe(true)
    const state = await readStaffActionTarget('report_flag', id)
    expect(state).toMatchObject({ resolution: 'dismissed', resolved_by_id: admin.id })
    const history = await readStaffActionHistory(admin.id)
    expect(history).toEqual([
      expect.objectContaining({ action_type: 'report_integrity_flag_review' }),
    ])
    expectTypedError(
      await invoke(admin, 'review_report_integrity_flag', { id, resolution: 'dismissed' }),
      404,
    )
    expect(await readStaffActionTarget('report_flag', id)).toEqual(state)
    expect(await readStaffActionHistory(admin.id)).toEqual(history)
  })

  it('refuses an unknown queue before recording or performing an operation', async () => {
    const admin = await createTestUser({ administrator: true })
    for (const name of ['pause_queue', 'resume_queue', 'retry_failed_queue_jobs']) {
      expectTypedError(await invoke(admin, name, { name: unique() }), 404)
    }
    expect(await readStaffActionHistory(admin.id)).toEqual([])
  })

  it('creates an import batch with actor history through the registered tool', async () => {
    const admin = await createTestUser({ administrator: true })
    const result = await invoke(admin, 'import_topics', {
      csv: `slug,name\n${unique()},Fixture topic`,
    })
    expect(result.isError).not.toBe(true)
    const { batches } = await readStaffEditorialRows(admin.id)
    expect(batches).toHaveLength(1)
    expect(batches[0]).toMatchObject({
      created_by_id: admin.id,
      import_type: 'topic',
      total_rows: 1,
    })
    expect(await readStaffActionHistory(admin.id)).toEqual([
      expect.objectContaining({ action_type: 'import_batch_create' }),
    ])
  })

  it('rejects invalid import rows without a batch or history entry', async () => {
    const admin = await createTestUser({ administrator: true })
    expectTypedError(await invoke(admin, 'import_topics', { csv: 'unknown_column\ninvalid' }), 422)
    expect((await readStaffEditorialRows(admin.id)).batches).toEqual([])
    expect(await readStaffActionHistory(admin.id)).toEqual([])
  })
})
