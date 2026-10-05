import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  insertTestPostReview,
  insertTestTopic,
  setPostDeletedForTest,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import { callRejectedMcpTool, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import {
  countTestReviewDisputesByDisputant,
  listTestMcpCreateAttempts,
} from '@voucha/test-helpers/mcp-write-tool-rows'
import { adminVerifyTopicClaim } from '@services/topic-claims/admin-verify'
import { createTopicClaim } from '@services/topic-claims/create'
import createTool from '../create-review-dispute.mts'

const SCOPES = ['disputes:read', 'disputes:write'] as const
const TOOL = 'create_review_dispute'

const suffix = () => crypto.randomUUID().slice(0, 8)

async function topicWithReview(postType: 'review' | 'discussion' = 'review') {
  const staff = await createTestUser({ administrator: true })
  const topicId = await insertTestTopic({
    name: `Dispute Topic ${suffix()}`,
    slug: `dispute-topic-${suffix()}`,
    createdById: staff.id,
  })
  const postId = await insertTestPost({
    title: `Dispute Review ${suffix()}`,
    slug: `dispute-review-${suffix()}`,
    createdById: (await createTestUser()).id,
    markdown: 'The product has serious flaws.',
    postType,
  })
  if (postType === 'review') await insertTestPostReview(postId, topicId, 2)
  return { staff, topicId, postId }
}
async function claimant(topicId: string, staffId: string) {
  const caller = await createTestPlusMcpCaller()
  const { claim } = await createTopicClaim(caller.id, {
    topicId,
    claimedRole: 'Issuer',
    evidence: '',
  })
  await adminVerifyTopicClaim(staffId, claim.id)
  return caller
}
const args = (postId: string, extra: Record<string, unknown> = {}) => ({
  idempotency_key: crypto.randomUUID(),
  post_id: postId,
  reason: 'factually_inaccurate',
  claim_text: 'This review contains false information about our product.',
  ...extra,
})
const expectNothingWritten = async (userId: string) => {
  expect(await countTestReviewDisputesByDisputant(userId)).toBe(0)
  expect(await listTestMcpCreateAttempts(userId)).toEqual([])
}
const errorOf = async (caller: Parameters<typeof callRejectedMcpTool>[0], input: object) =>
  JSON.parse(await callRejectedMcpTool(caller, TOOL, input as never, SCOPES))

describe('create_review_dispute — real store', () => {
  it('files a pending dispute as the credential owner and returns only facts', async () => {
    const { staff, topicId, postId } = await topicWithReview()
    const caller = await claimant(topicId, staff.id)

    const result = await callStructuredMcpTool(caller, TOOL, args(postId), SCOPES)

    expect(result).toMatchObject({
      success: true,
      is_duplicate: false,
      dispute: {
        id: expect.any(String),
        post_id: postId,
        topic_id: topicId,
        reason: 'factually_inaccurate',
        status: 'pending',
        resolution_action: null,
        public_response: null,
        sent_at: null,
      },
    })
    expect(result.dispute).not.toHaveProperty('claim_text')
    expect(result.dispute).not.toHaveProperty('post_content')
    expect(result.dispute).not.toHaveProperty('disputant_user_id')
    expect(await countTestReviewDisputesByDisputant(caller.id)).toBe(1)
  })

  it('updates the open dispute instead of adding another for a new key', async () => {
    const { staff, topicId, postId } = await topicWithReview()
    const caller = await claimant(topicId, staff.id)
    const first = await callStructuredMcpTool(caller, TOOL, args(postId), SCOPES)

    const second = await callStructuredMcpTool(
      caller,
      TOOL,
      args(postId, { reason: 'defamatory', claim_text: 'More detail.' }),
      SCOPES,
    )

    expect(second).toMatchObject({ is_duplicate: true, dispute: { reason: 'defamatory' } })
    expect((second.dispute as { id: string }).id).toBe((first.dispute as { id: string }).id)
    expect(await countTestReviewDisputesByDisputant(caller.id)).toBe(1)
  })

  it('replays the first result for the same key and request without writing again', async () => {
    const { staff, topicId, postId } = await topicWithReview()
    const caller = await claimant(topicId, staff.id)
    const input = args(postId)
    const first = await callStructuredMcpTool(caller, TOOL, input, SCOPES)
    const attempts = await listTestMcpCreateAttempts(caller.id)

    const second = await callStructuredMcpTool(caller, TOOL, input, SCOPES)

    expect(second).toEqual(first)
    expect(await listTestMcpCreateAttempts(caller.id)).toEqual(attempts)
    expect(attempts).toHaveLength(1)
    expect(await countTestReviewDisputesByDisputant(caller.id)).toBe(1)
  })

  it('rejects the same key with a changed request and leaves the first dispute alone', async () => {
    const { staff, topicId, postId } = await topicWithReview()
    const caller = await claimant(topicId, staff.id)
    const input = args(postId)
    await callStructuredMcpTool(caller, TOOL, input, SCOPES)
    const attempts = await listTestMcpCreateAttempts(caller.id)

    for (const changed of [{ reason: 'defamatory' }, { claim_text: 'A different case.' }]) {
      expect(await errorOf(caller, { ...input, ...changed })).toMatchObject({
        error: { status: 409, code: 'IDEMPOTENCY_KEY_REUSED', retryable: false },
      })
    }

    expect(await listTestMcpCreateAttempts(caller.id)).toEqual(attempts)
    expect(await countTestReviewDisputesByDisputant(caller.id)).toBe(1)
  })

  it('refuses a user without a verified claim on the topic and writes nothing', async () => {
    const { postId } = await topicWithReview()
    const caller = await createTestPlusMcpCaller()

    expect(await errorOf(caller, args(postId))).toMatchObject({
      error: { status: 403, code: 'FORBIDDEN' },
    })

    await expectNothingWritten(caller.id)
  })

  it('refuses posts that cannot be disputed, as the web does, and writes nothing', async () => {
    const { staff, topicId, postId } = await topicWithReview()
    const caller = await claimant(topicId, staff.id)
    const { postId: discussionId } = await topicWithReview('discussion')
    const { postId: removedId } = await topicWithReview()
    await setPostDeletedForTest(removedId)
    const { topicId: otherTopicId } = await topicWithReview()

    for (const [input, status] of [
      [args(crypto.randomUUID()), 404],
      [args(discussionId), 422],
      [args(removedId), 410],
      [args(postId, { topic_id: otherTopicId }), 422],
    ] as const) {
      expect(await errorOf(caller, input)).toMatchObject({ error: { status } })
    }

    await expectNothingWritten(caller.id)
  })

  it('refuses direct calls without delegated context or with another owner', async () => {
    const { staff, topicId, postId } = await topicWithReview()
    const caller = await claimant(topicId, staff.id)
    const input = args(postId)
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
    ['an unknown reason', { reason: 'rude' }],
    ['a missing claim', { claim_text: undefined }],
    ['a malformed post id', { post_id: 'not-a-uuid' }],
    ['a malformed topic id', { topic_id: 'not-a-uuid' }],
    ['a non-uuid idempotency key', { idempotency_key: 'not-a-uuid' }],
    ['an unexpected field', { resolution_action: 'remove' }],
  ])('refuses %s as invalid arguments before claiming a key', async (_label, extra) => {
    const { staff, topicId, postId } = await topicWithReview()
    const caller = await claimant(topicId, staff.id)
    const text = await callRejectedMcpTool(caller, TOOL, args(postId, extra), SCOPES)
    expect(text).toContain('Invalid tool arguments')
    await expectNothingWritten(caller.id)
  })

  it.each([
    ['an empty claim', { claim_text: '   ' }],
    ['a claim over 4000 characters', { claim_text: 'x'.repeat(4001) }],
  ])('refuses %s with the shared parser and writes nothing', async (_label, extra) => {
    const { staff, topicId, postId } = await topicWithReview()
    const caller = await claimant(topicId, staff.id)
    expect(await errorOf(caller, args(postId, extra))).toMatchObject({
      error: { status: 422, code: 'INVALID_INPUT' },
    })
    await expectNothingWritten(caller.id)
  })

  it('requires the write scope, the Plus plan and an unsuspended owner', async () => {
    const { staff, topicId, postId } = await topicWithReview()
    const caller = await claimant(topicId, staff.id)
    const input = args(postId)

    expect(await callRejectedMcpTool(caller, TOOL, input, ['disputes:read'])).toContain(
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
