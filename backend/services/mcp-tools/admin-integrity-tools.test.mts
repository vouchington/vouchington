import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  insertTestPostVote,
  insertTestVoteIntegrityFlag,
  insertTestReportIntegrityFlag,
  insertTestReportAbusePenalty,
  insertTestVoteWeightPenalty,
  getTestPenaltiesByFlagId,
  getTestReportAbusePenaltiesByUserId,
} from '@voucha/test-helpers'
import {
  readStaffActionHistory,
  readStaffActionTarget,
} from '@voucha/test-helpers/staff-action-history'
import type { PrivateUser } from '@services/users/types'
import { SCOPE_DEFINITIONS, type ApiScope } from '@modules/scopes'
import { callMcpTool } from './call-tool.mts'
import { ADMIN_MCP_SERVER_CONFIG } from './config.mts'

const scopes = Object.keys(SCOPE_DEFINITIONS).filter(
  scope => SCOPE_DEFINITIONS[scope as ApiScope].audience === 'admin',
) as ApiScope[]
const invoke = (admin: PrivateUser, name: string, args: unknown) =>
  callMcpTool(name, args, { ...admin, membership_plan: null }, scopes, ADMIN_MCP_SERVER_CONFIG)

function expectError(result: Awaited<ReturnType<typeof invoke>>, status: number): void {
  expect(result.isError).toBe(true)
  const block = result.content[0]!
  expect(block.type).toBe('text')
  if (block.type !== 'text') throw new Error('Expected typed domain error')
  expect(JSON.parse(block.text)).toMatchObject({ error: { status, retryable: false } })
}

async function makeFlagPost(authorId: string): Promise<string> {
  const suffix = randomUUID()
  return insertTestPost({ createdById: authorId, title: suffix, slug: suffix, markdown: suffix })
}

describe('registered account and integrity writes', () => {
  it('reviews a vote flag once and preserves its history on retry', async () => {
    const admin = await createTestUser({ administrator: true })
    const author = await createTestUser()
    const id = await insertTestVoteIntegrityFlag({ postId: await makeFlagPost(author.id) })
    expect(
      (await invoke(admin, 'review_vote_integrity_flag', { id, resolution: 'dismissed' })).isError,
    ).not.toBe(true)
    const state = await readStaffActionTarget('vote_flag', id)
    expect(state).toMatchObject({ resolution: 'dismissed', resolved_by_id: admin.id })
    const history = await readStaffActionHistory(admin.id)
    expect(history).toEqual([
      expect.objectContaining({ action_type: 'vote_integrity_flag_review' }),
    ])
    expectError(
      await invoke(admin, 'review_vote_integrity_flag', { id, resolution: 'dismissed' }),
      404,
    )
    expect(await readStaffActionTarget('vote_flag', id)).toEqual(state)
    expect(await readStaffActionHistory(admin.id)).toEqual(history)
  })

  it('applies a report penalty to captured reporters and rejects repeated application', async () => {
    const admin = await createTestUser({ administrator: true })
    const author = await createTestUser()
    const reporter = await createTestUser()
    const id = await insertTestReportIntegrityFlag({
      reportedUserId: author.id,
      reporterUserIds: [reporter.id],
    })
    expect((await invoke(admin, 'apply_report_abuse_penalty', { id })).isError).not.toBe(true)
    expect(await readStaffActionTarget('report_flag', id)).toMatchObject({
      resolution: 'penalized',
      resolved_by_id: admin.id,
    })
    const penalties = await getTestReportAbusePenaltiesByUserId(reporter.id)
    expect(penalties).toEqual([
      expect.objectContaining({ source_flag_id: id, created_by_id: admin.id }),
    ])
    const history = await readStaffActionHistory(admin.id)
    expect(history).toEqual([
      expect.objectContaining({ action_type: 'report_integrity_penalty_apply' }),
    ])
    expectError(await invoke(admin, 'apply_report_abuse_penalty', { id }), 409)
    expect(await getTestReportAbusePenaltiesByUserId(reporter.id)).toEqual(penalties)
    expect(await readStaffActionHistory(admin.id)).toEqual(history)
  })

  it('applies a vote penalty and returns the atomically resolved flag', async () => {
    const admin = await createTestUser({ administrator: true })
    const author = await createTestUser()
    const voter = await createTestUser()
    const postId = await makeFlagPost(author.id)
    await insertTestPostVote(postId, voter.id, '127.0.0.1', 1)
    const id = await insertTestVoteIntegrityFlag({ postId })
    const result = await invoke(admin, 'apply_vote_ring_penalty', { id })
    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toMatchObject({
      penalized_user_count: 1,
      flag: { id, resolution: 'penalized', resolved_by_id: admin.id },
    })
    const penalties = await getTestPenaltiesByFlagId(id)
    expect(penalties).toEqual([expect.objectContaining({ user_id: voter.id })])
    const history = await readStaffActionHistory(admin.id)
    expect(history).toEqual([
      expect.objectContaining({ action_type: 'vote_integrity_penalty_apply' }),
    ])
    expectError(await invoke(admin, 'apply_vote_ring_penalty', { id }), 409)
    expect(await getTestPenaltiesByFlagId(id)).toEqual(penalties)
    expect(await readStaffActionHistory(admin.id)).toEqual(history)
  })

  it.each(['report', 'vote'] as const)(
    'lifts a %s penalty with history and rejects repeated lifts',
    async kind => {
      const admin = await createTestUser({ administrator: true })
      const target = await createTestUser()
      const id =
        kind === 'report'
          ? await insertTestReportAbusePenalty({ userId: target.id, createdById: admin.id })
          : await insertTestVoteWeightPenalty(target.id, admin.id)
      const name = kind === 'report' ? 'lift_report_abuse_penalty' : 'lift_vote_ring_penalty'
      expect((await invoke(admin, name, { id })).isError).not.toBe(true)
      const state = await readStaffActionTarget(
        kind === 'report' ? 'report_penalty' : 'vote_penalty',
        id,
      )
      expect(state).toMatchObject({ revoked_by_id: admin.id, revoked_at: expect.any(String) })
      const history = await readStaffActionHistory(admin.id)
      expect(history).toEqual([
        expect.objectContaining({ action_type: `${kind}_integrity_penalty_revoke` }),
      ])
      expectError(await invoke(admin, name, { id }), 404)
      expect(await readStaffActionHistory(admin.id)).toEqual(history)
    },
  )
})
