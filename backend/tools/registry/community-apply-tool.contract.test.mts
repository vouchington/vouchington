import { describe, expect, it } from 'vitest'
import {
  archiveTestCommunity,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityBan,
  insertTestCommunityMember,
  listTestCommunityApplicationAnswers,
  readTestContentProvenance,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import { callRejectedMcpTool, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import {
  countTestCommunityApplicationsByUser,
  listTestMcpCreateAttempts,
} from '@voucha/test-helpers/mcp-write-tool-rows'
import { setApplicationQuestions } from '@services/communities'
import applyTool from '../apply-to-community.mts'

const SCOPES = ['communities:read', 'communities:write'] as const
const TOOL = 'apply_to_community'

async function communityWithQuestions(visibility: 'private' | 'public' = 'private') {
  const owner = await createTestUser()
  const community = await insertTestCommunity({ createdById: owner.id, visibility })
  await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  const questions = await setApplicationQuestions(owner.id, community.id, [
    { question: 'Why join', field_type: 'short_text', is_required: true },
    { question: 'Agree', field_type: 'checkbox', is_required: false },
  ])
  const [why, agree] = questions
  return { owner, community, why: why!.id, agree: agree!.id }
}
const args = (
  communityId: string,
  answers: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) => ({
  idempotency_key: crypto.randomUUID(),
  community_id: communityId,
  answers,
  ...extra,
})
const expectNothingWritten = async (userId: string) => {
  expect(await countTestCommunityApplicationsByUser(userId)).toBe(0)
  expect(await listTestMcpCreateAttempts(userId)).toEqual([])
}
const errorOf = async (caller: Parameters<typeof callRejectedMcpTool>[0], input: object) =>
  JSON.parse(await callRejectedMcpTool(caller, TOOL, input as never, SCOPES))

describe('apply_to_community — real store', () => {
  it('files a pending application as the credential owner and returns only facts', async () => {
    const { community, why, agree } = await communityWithQuestions()
    const caller = await createTestPlusMcpCaller()

    const result = await callStructuredMcpTool(
      caller,
      TOOL,
      args(community.slug, { [why]: 'I birdwatch', [agree]: true }, { message: ' Hello ' }),
      SCOPES,
    )

    expect(result).toEqual({
      success: true,
      application: {
        id: expect.any(String),
        community_id: community.id,
        status: 'pending',
        created_at: expect.any(String),
      },
    })
    const { id } = result.application as { id: string }
    expect(await readTestContentProvenance('community_applications', id)).toEqual({
      createdVia: 'mcp',
      oauthClientId: null,
    })
    expect(await listTestCommunityApplicationAnswers(id)).toEqual(
      expect.arrayContaining([
        { question_id: why, value: 'I birdwatch' },
        { question_id: agree, value: true },
      ]),
    )
    expect(await countTestCommunityApplicationsByUser(caller.id)).toBe(1)
  })

  it('replays the first result for the same key and request without writing again', async () => {
    const { community, why } = await communityWithQuestions()
    const caller = await createTestPlusMcpCaller()
    const input = args(community.id, { [why]: 'Same' }, { message: 'Same request' })
    const first = await callStructuredMcpTool(caller, TOOL, input, SCOPES)
    const attempts = await listTestMcpCreateAttempts(caller.id)

    const second = await callStructuredMcpTool(caller, TOOL, input, SCOPES)

    expect(second).toEqual(first)
    expect(await listTestMcpCreateAttempts(caller.id)).toEqual(attempts)
    expect(attempts).toHaveLength(1)
    expect(await countTestCommunityApplicationsByUser(caller.id)).toBe(1)
  })

  it('rejects the same key with a changed request and keeps the first application', async () => {
    const { community, why } = await communityWithQuestions()
    const caller = await createTestPlusMcpCaller()
    const input = args(community.id, { [why]: 'First' })
    await callStructuredMcpTool(caller, TOOL, input, SCOPES)
    const attempts = await listTestMcpCreateAttempts(caller.id)

    for (const changed of [{ answers: { [why]: 'Second' } }, { message: 'Added note' }]) {
      expect(await errorOf(caller, { ...input, ...changed })).toMatchObject({
        error: { status: 409, code: 'IDEMPOTENCY_KEY_REUSED', retryable: false },
      })
    }

    expect(await listTestMcpCreateAttempts(caller.id)).toEqual(attempts)
    expect(await countTestCommunityApplicationsByUser(caller.id)).toBe(1)
  })

  it('refuses a second open application and an existing member, freeing the keys', async () => {
    const { community, why } = await communityWithQuestions()
    const applicant = await createTestPlusMcpCaller()
    const member = await createTestPlusMcpCaller()
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })
    await callStructuredMcpTool(applicant, TOOL, args(community.id, { [why]: 'One' }), SCOPES)

    expect(await errorOf(applicant, args(community.id, { [why]: 'Two' }))).toMatchObject({
      error: { status: 409, code: 'CONFLICT' },
    })
    expect(await errorOf(member, args(community.id, { [why]: 'Member' }))).toMatchObject({
      error: { status: 409, code: 'CONFLICT' },
    })

    expect(await countTestCommunityApplicationsByUser(applicant.id)).toBe(1)
    expect(await listTestMcpCreateAttempts(applicant.id)).toHaveLength(1)
    await expectNothingWritten(member.id)
  })

  it('applies the community rules of the web and writes nothing', async () => {
    const caller = await createTestPlusMcpCaller()
    const staff = await createTestUser({ administrator: true })
    const { community: banned, why } = await communityWithQuestions()
    await insertTestCommunityBan({
      communityId: banned.id,
      userId: caller.id,
      bannedById: staff.id,
    })
    const { community: archived } = await communityWithQuestions()
    await archiveTestCommunity({ communityId: archived.id, archivedById: staff.id })
    const { community: open } = await communityWithQuestions('public')

    for (const [community_id, status] of [
      [banned.id, 403],
      [archived.id, 409],
      [open.id, 422],
      [crypto.randomUUID(), 404],
    ] as const) {
      expect(await errorOf(caller, args(community_id, { [why]: 'Hi' }))).toMatchObject({
        error: { status },
      })
    }

    await expectNothingWritten(caller.id)
  })

  it('refuses answers the community questions reject and an overlong message', async () => {
    const { community, why, agree } = await communityWithQuestions()
    const caller = await createTestPlusMcpCaller()

    for (const [answers, message] of [
      [{}, undefined],
      [{ [why]: 'ok', [crypto.randomUUID()]: 'unknown question' }, undefined],
      [{ [why]: 'ok', [agree]: 'not a boolean' }, undefined],
      [{ [why]: 'ok' }, 'x'.repeat(5001)],
    ] as const) {
      expect(await errorOf(caller, args(community.id, answers, { message }))).toMatchObject({
        error: { status: 422, code: 'INVALID_INPUT' },
      })
    }

    await expectNothingWritten(caller.id)
  })

  it('refuses direct calls without delegated context or with another owner', async () => {
    const { community, why } = await communityWithQuestions()
    const caller = await createTestPlusMcpCaller()
    const input = args(community.id, { [why]: 'Hi' })
    await expect(applyTool.function(caller)(input)).rejects.toMatchObject({ status: 403 })
    await expect(
      applyTool.function(caller)(input, {
        credentialOwnerId: crypto.randomUUID(),
        grantedScopes: SCOPES,
      }),
    ).rejects.toMatchObject({ status: 403, message: 'Forbidden' })
    await expectNothingWritten(caller.id)
  })

  it.each([
    ['a missing answers object', { answers: undefined }],
    ['a numeric answer', { answers: { [crypto.randomUUID()]: 7 } }],
    ['a non-uuid idempotency key', { idempotency_key: 'not-a-uuid' }],
    ['an unexpected field', { role: 'owner' }],
    ['a non-string message', { message: 7 }],
  ])('refuses %s as invalid arguments', async (_label, extra) => {
    const { community, why } = await communityWithQuestions()
    const caller = await createTestPlusMcpCaller()
    const text = await callRejectedMcpTool(
      caller,
      TOOL,
      args(community.id, { [why]: 'Hi' }, extra),
      SCOPES,
    )
    expect(text).toContain('Invalid tool arguments')
    await expectNothingWritten(caller.id)
  })

  it('requires the write scope, the Plus plan and an unsuspended owner', async () => {
    const { community, why } = await communityWithQuestions()
    const caller = await createTestPlusMcpCaller()
    const input = args(community.id, { [why]: 'Hi' })

    expect(await callRejectedMcpTool(caller, TOOL, input, ['communities:read'])).toContain(
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
