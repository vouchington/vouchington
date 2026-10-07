import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityBan,
  insertTestPost,
  insertTestUserWarning,
  readTestContentProvenance,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import { callRejectedMcpTool, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { withPostgresQueryFailureForTest } from '@voucha/test-helpers/postgres-query-failure'
import {
  listTestModerationCasesForEntity,
  resolveTestModerationCase,
} from '@voucha/test-helpers/entities/moderation-case-reads'
import {
  countTestModerationAppealsByAppellant,
  listTestDelegatedCreateReservations,
} from '@voucha/test-helpers/mcp-write-tool-rows'
import createTool from '../create-moderation-appeal.mts'

const SCOPES = ['appeals:read', 'appeals:write'] as const
const TOOL = 'create_moderation_appeal'
const suffix = () => crypto.randomUUID().slice(0, 8)

const warningFor = async (userId: string) =>
  (await insertTestUserWarning({ userId, issuedById: (await createTestUser()).id })).id
const removedPostBy = (userId: string) =>
  insertTestPost({
    title: `Removed ${suffix()}`,
    slug: `removed-${suffix()}`,
    createdById: userId,
    markdown: 'Removed content',
    clearanceStatus: 'rejected',
  })
async function banFor(userId: string, lifted = false) {
  const staff = await createTestUser({ administrator: true })
  const community = await insertTestCommunity({ createdById: staff.id })
  const ban = await insertTestCommunityBan({
    communityId: community.id,
    userId,
    bannedById: staff.id,
    ...(lifted ? { liftedAt: new Date(), liftedById: staff.id } : {}),
  })
  return { banId: ban.id, communityId: community.id }
}
const args = (targetId: string, extra: Record<string, unknown> = {}) => ({
  idempotency_key: crypto.randomUUID(),
  target_type: 'warning',
  target_id: targetId,
  appeal_reason: 'This decision was a mistake.',
  ...extra,
})
const expectNothingWritten = async (userId: string) => {
  expect(await countTestModerationAppealsByAppellant(userId)).toBe(0)
  expect(await listTestDelegatedCreateReservations(userId)).toEqual([])
}
const errorOf = async (caller: Parameters<typeof callRejectedMcpTool>[0], input: object) =>
  JSON.parse(await callRejectedMcpTool(caller, TOOL, input as never, SCOPES))

describe('create_moderation_appeal — real store', () => {
  it('appeals a warning as the credential owner and returns only facts', async () => {
    const caller = await createTestPlusMcpCaller()
    const warningId = await warningFor(caller.id)

    const result = await callStructuredMcpTool(caller, TOOL, args(warningId), SCOPES)

    expect(result).toMatchObject({
      success: true,
      is_duplicate: false,
      appeal: {
        id: expect.any(String),
        target_type: 'warning',
        target_id: warningId,
        community_id: null,
        post_removal_kind: null,
        status: 'pending',
        resolution_action: null,
        public_response: null,
      },
    })
    expect(result.appeal).not.toHaveProperty('appeal_reason')
    expect(result.appeal).not.toHaveProperty('target_context')
    const { id } = result.appeal as { id: string }
    expect(await readTestContentProvenance('moderation_appeals', id)).toEqual({
      createdVia: 'mcp',
      oauthClientId: null,
    })
    expect(await countTestModerationAppealsByAppellant(caller.id)).toBe(1)
  })

  it('leaves the warning case resolved when admission cannot store the appeal response', async () => {
    const caller = await createTestPlusMcpCaller()
    const staff = await createTestUser()
    const warning = await insertTestUserWarning({ userId: caller.id, issuedById: staff.id })
    await resolveTestModerationCase(warning.case_id, staff.id)
    const entity = { entityType: 'user', entityId: caller.id } as const
    const before = await listTestModerationCasesForEntity(entity)
    expect(before).toMatchObject([{ id: warning.case_id, resolved_by_id: staff.id }])
    expect(before[0]?.resolved_at).not.toBeNull()

    const { error } = await withPostgresQueryFailureForTest(
      '/* runContributionAdmission.commit */',
      () => callRejectedMcpTool(caller, TOOL, args(warning.id), SCOPES),
    )

    expect(error).toMatchObject({ code: '25P02' })
    expect(await listTestModerationCasesForEntity(entity)).toEqual(before)
    expect(await countTestModerationAppealsByAppellant(caller.id)).toBe(0)
  })

  it('appeals a community ban and the removal of an own post', async () => {
    const caller = await createTestPlusMcpCaller()
    const { banId, communityId } = await banFor(caller.id)
    const postId = await removedPostBy(caller.id)

    const ban = await callStructuredMcpTool(
      caller,
      TOOL,
      args(banId, { target_type: 'ban' }),
      SCOPES,
    )
    const removal = await callStructuredMcpTool(
      caller,
      TOOL,
      args(postId, { target_type: 'removal', post_removal_kind: 'platform' }),
      SCOPES,
    )

    expect(ban.appeal).toMatchObject({
      target_type: 'ban',
      target_id: banId,
      community_id: communityId,
    })
    expect(removal.appeal).toMatchObject({
      target_type: 'removal',
      target_id: postId,
      post_removal_kind: 'platform',
    })
    expect(await countTestModerationAppealsByAppellant(caller.id)).toBe(2)
  })

  it('updates the open appeal instead of adding another for a new key', async () => {
    const caller = await createTestPlusMcpCaller()
    const warningId = await warningFor(caller.id)
    const first = await callStructuredMcpTool(caller, TOOL, args(warningId), SCOPES)

    const second = await callStructuredMcpTool(
      caller,
      TOOL,
      args(warningId, { appeal_reason: 'More context.' }),
      SCOPES,
    )

    expect(second).toMatchObject({ is_duplicate: true })
    expect((second.appeal as { id: string }).id).toBe((first.appeal as { id: string }).id)
    expect(await countTestModerationAppealsByAppellant(caller.id)).toBe(1)
  })

  it('replays the first result for the same key and request without writing again', async () => {
    const caller = await createTestPlusMcpCaller()
    const input = args(await warningFor(caller.id))
    const first = await callStructuredMcpTool(caller, TOOL, input, SCOPES)
    const attempts = await listTestDelegatedCreateReservations(caller.id)

    const second = await callStructuredMcpTool(caller, TOOL, input, SCOPES)

    expect(second).toEqual(first)
    expect(await listTestDelegatedCreateReservations(caller.id)).toEqual(attempts)
    expect(attempts).toHaveLength(1)
    expect(await countTestModerationAppealsByAppellant(caller.id)).toBe(1)
  })

  it('rejects the same key with a changed request and leaves the first appeal alone', async () => {
    const caller = await createTestPlusMcpCaller()
    const input = args(await warningFor(caller.id))
    await callStructuredMcpTool(caller, TOOL, input, SCOPES)
    const attempts = await listTestDelegatedCreateReservations(caller.id)

    expect(await errorOf(caller, { ...input, appeal_reason: 'A different case.' })).toMatchObject({
      error: { status: 409, code: 'IDEMPOTENCY_KEY_REUSED', retryable: false },
    })

    expect(await listTestDelegatedCreateReservations(caller.id)).toEqual(attempts)
    expect(await countTestModerationAppealsByAppellant(caller.id)).toBe(1)
  })

  it("refuses another user's decision and a decision that is gone, writing nothing", async () => {
    const caller = await createTestPlusMcpCaller()
    const other = await createTestUser()
    const { banId: otherBan } = await banFor(other.id)
    const { banId: liftedBan } = await banFor(caller.id, true)
    const activePost = await insertTestPost({
      title: `Active ${suffix()}`,
      slug: `active-${suffix()}`,
      createdById: caller.id,
      markdown: 'Still published',
    })

    for (const [input, status] of [
      [args(await warningFor(other.id)), 403],
      [args(otherBan, { target_type: 'ban' }), 403],
      [args(await removedPostBy(other.id), { target_type: 'removal' }), 403],
      [args(crypto.randomUUID()), 404],
      [args(liftedBan, { target_type: 'ban' }), 404],
      [args(activePost, { target_type: 'removal' }), 422],
    ] as const) {
      expect(await errorOf(caller, input)).toMatchObject({ error: { status } })
    }

    await expectNothingWritten(caller.id)
  })

  it('refuses direct calls without delegated context or with another owner', async () => {
    const caller = await createTestPlusMcpCaller()
    const input = args(await warningFor(caller.id))
    await expect(createTool.function(caller)(input)).rejects.toMatchObject({ status: 403 })
    await expect(
      createTool.function(caller)(input, {
        credentialOwnerId: crypto.randomUUID(),
        grantedScopes: SCOPES,
      }),
    ).rejects.toMatchObject({ status: 403, message: 'Forbidden' })
    await expectNothingWritten(caller.id)
  })

  it.each([
    ['an account suspension target, which is appealed on the web', { target_type: 'suspension' }],
    ['an unknown target type', { target_type: 'report' }],
    ['a malformed target id', { target_id: 'not-a-uuid' }],
    ['a missing reason', { appeal_reason: undefined }],
    ['an unknown removal kind', { post_removal_kind: 'staff' }],
    ['a non-uuid idempotency key', { idempotency_key: 'not-a-uuid' }],
    ['an unexpected field', { resolution_action: 'accept' }],
  ])('refuses %s as invalid arguments before claiming a key', async (_label, extra) => {
    const caller = await createTestPlusMcpCaller()
    const text = await callRejectedMcpTool(
      caller,
      TOOL,
      args(await warningFor(caller.id), extra),
      SCOPES,
    )
    expect(text).toContain('Invalid tool arguments')
    await expectNothingWritten(caller.id)
  })

  it.each([
    ['an empty reason', { appeal_reason: '  ' }],
    ['a reason over 4000 characters', { appeal_reason: 'x'.repeat(4001) }],
    ['a removal kind on a warning', { post_removal_kind: 'platform' }],
  ])('refuses %s with the shared parser and writes nothing', async (_label, extra) => {
    const caller = await createTestPlusMcpCaller()
    expect(await errorOf(caller, args(await warningFor(caller.id), extra))).toMatchObject({
      error: { status: 422, code: 'INVALID_INPUT' },
    })
    await expectNothingWritten(caller.id)
  })

  it('requires the write scope, the Plus plan and an unsuspended owner', async () => {
    const caller = await createTestPlusMcpCaller()
    const input = args(await warningFor(caller.id))

    expect(await callRejectedMcpTool(caller, TOOL, input, ['appeals:read'])).toContain(
      'Tool requires scopes',
    )
    expect(
      await callRejectedMcpTool({ ...caller, membership_plan: null }, TOOL, input, SCOPES),
    ).toContain('requires a higher plan')
    await suspendTestUser(caller.id)
    try {
      expect(await callRejectedMcpTool(caller, TOOL, input, SCOPES)).toContain('suspended')
    } finally {
      await unsuspendTestUser(caller.id)
    }

    await expectNothingWritten(caller.id)
  })
})
