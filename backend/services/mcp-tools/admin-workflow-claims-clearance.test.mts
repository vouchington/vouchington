import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  insertTestTopic,
  insertTestTopicClaim,
  getTestPostClearanceState,
} from '@voucha/test-helpers'
import {
  readStaffActionHistory,
  readStaffActionTarget,
} from '@voucha/test-helpers/staff-action-history'
import { readAdminWorkflowTraining } from '@voucha/test-helpers/admin-workflow-fixtures'
import { callMcpTool } from './call-tool.mts'
import { ADMIN_MCP_SERVER_CONFIG } from './config.mts'
import type { PrivateUser } from '@services/users/types'

const invoke = (user: PrivateUser, name: string, args: unknown) =>
  callMcpTool(
    name,
    args,
    { ...user, membership_plan: null },
    ['moderation:read', 'moderation:write', 'moderation:approve'],
    ADMIN_MCP_SERVER_CONFIG,
  )
function error(result: Awaited<ReturnType<typeof invoke>>, status: number) {
  expect(result.isError).toBe(true)
  const block = result.content[0]!
  if (block.type !== 'text') throw new Error('Expected typed error')
  expect(JSON.parse(block.text)).toMatchObject({ error: { status, retryable: false } })
}

describe('registered topic claim writes', () => {
  it.each([
    ['verify_topic_claim', 'topic_claim_verify', {}, 'verified_by_id'],
    [
      'reject_topic_claim',
      'topic_claim_reject',
      { rejection_reason: 'Insufficient evidence' },
      'rejected_by_id',
    ],
    [
      'revoke_topic_claim',
      'topic_claim_revoke',
      { revocation_reason: 'Evidence withdrawn' },
      'revoked_by_id',
    ],
  ] as const)(
    '%s persists history and refuses a repeated state transition',
    async (name, action, args, actorColumn) => {
      const admin = await createTestUser({ administrator: true })
      const owner = await createTestUser()
      const suffix = randomUUID()
      const topicId = await insertTestTopic({
        createdById: owner.id,
        name: suffix,
        slug: `claim-${suffix}`,
      })
      const id = await insertTestTopicClaim({ topicId, claimantUserId: owner.id })
      if (name === 'revoke_topic_claim') await invoke(admin, 'verify_topic_claim', { id })
      expect((await invoke(admin, name, { id, ...args })).isError).not.toBe(true)
      const state = await readStaffActionTarget('topic_claim', id)
      expect(state).toMatchObject({ [actorColumn]: admin.id })
      const history = await readStaffActionHistory(admin.id)
      expect(history).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ action_type: action, topic_claim_id: id }),
        ]),
      )
      error(await invoke(admin, name, { id, ...args }), 404)
      expect(await readStaffActionTarget('topic_claim', id)).toEqual(state)
      expect(await readStaffActionHistory(admin.id)).toEqual(history)
    },
  )
})

describe('registered post clearance writes', () => {
  it.each([
    ['set_post_clearance', 'rejected', 'reject', 'rejected_at'],
    ['approve_post_clearance', 'approved', 'approve', 'approved_at'],
  ] as const)(
    '%s changes clearance with actor history and no agent training',
    async (name, status, action, column) => {
      const admin = await createTestUser({ administrator: true })
      const owner = await createTestUser()
      const suffix = randomUUID()
      const id = await insertTestPost({
        createdById: owner.id,
        title: suffix,
        slug: `clearance-${suffix}`,
        markdown: 'Fixture content',
      })
      expect(
        (await invoke(admin, name, { id, status, reason_code: 'staff_reviewed' })).isError,
      ).not.toBe(true)
      expect((await getTestPostClearanceState(id))?.[column]).not.toBeNull()
      expect(await readStaffActionHistory(admin.id)).toEqual(
        expect.arrayContaining([expect.objectContaining({ action_type: action, post_id: id })]),
      )
      expect(await readAdminWorkflowTraining(admin.id)).toEqual([])
    },
  )

  it.each(['set_post_clearance', 'approve_post_clearance'])(
    '%s rejects a missing post without history or training',
    async name => {
      const admin = await createTestUser({ administrator: true })
      error(
        await invoke(admin, name, {
          id: randomUUID(),
          status: name === 'set_post_clearance' ? 'rejected' : 'approved',
          reason_code: 'staff_reviewed',
        }),
        404,
      )
      expect(await readStaffActionHistory(admin.id)).toEqual([])
      expect(await readAdminWorkflowTraining(admin.id)).toEqual([])
    },
  )
})
