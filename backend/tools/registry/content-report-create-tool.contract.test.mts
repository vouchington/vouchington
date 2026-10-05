import { describe, expect, it } from 'vitest'
import {
  createTestPost,
  createTestUser,
  readTestContentProvenance,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import { callRejectedMcpTool, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import {
  countTestModerationReportsByReporter,
  listTestMcpCreateAttempts,
} from '@voucha/test-helpers/mcp-write-tool-rows'
import createTool from '../create-content-report.mts'

const SCOPES = ['reports:write'] as const
const TOOL = 'create_content_report'

const reportablePostId = async () => (await createTestPost({ user: await createTestUser() }))!.id
const args = (entityId: string, extra: Record<string, unknown> = {}) => ({
  idempotency_key: crypto.randomUUID(),
  entity_type: 'post',
  entity_id: entityId,
  reason: 'spam',
  ...extra,
})
const expectNothingWritten = async (userId: string) => {
  expect(await countTestModerationReportsByReporter(userId)).toBe(0)
  expect(await listTestMcpCreateAttempts(userId)).toEqual([])
}
const errorOf = async (caller: Parameters<typeof callRejectedMcpTool>[0], input: object) =>
  JSON.parse(await callRejectedMcpTool(caller, TOOL, input as never, SCOPES))

describe('create_content_report — real store', () => {
  it('files a report as the credential owner and returns only facts', async () => {
    const caller = await createTestPlusMcpCaller()
    const postId = await reportablePostId()

    const result = await callStructuredMcpTool(
      caller,
      TOOL,
      args(postId, { note: 'Looks like spam' }),
      SCOPES,
    )

    expect(result).toEqual({
      success: true,
      report: {
        id: expect.any(String),
        entity_type: 'post',
        entity_id: postId,
        reason: 'spam',
        status: 'pending',
        created_at: expect.any(String),
      },
      is_duplicate: false,
    })
    const { id } = result.report as { id: string }
    expect(await readTestContentProvenance('moderation_reports', id)).toEqual({
      createdVia: 'mcp',
      oauthClientId: null,
    })
    expect(await countTestModerationReportsByReporter(caller.id)).toBe(1)
  })

  it('updates the open report instead of adding another for a new key', async () => {
    const caller = await createTestPlusMcpCaller()
    const postId = await reportablePostId()
    const first = await callStructuredMcpTool(caller, TOOL, args(postId), SCOPES)

    const second = await callStructuredMcpTool(
      caller,
      TOOL,
      args(postId, { reason: 'harassment' }),
      SCOPES,
    )

    expect(second).toMatchObject({ is_duplicate: true, report: { reason: 'harassment' } })
    expect((second.report as { id: string }).id).toBe((first.report as { id: string }).id)
    expect(await countTestModerationReportsByReporter(caller.id)).toBe(1)
  })

  it('replays the first result for the same key and request without writing again', async () => {
    const caller = await createTestPlusMcpCaller()
    const input = args(await reportablePostId(), { note: 'Same request' })
    const first = await callStructuredMcpTool(caller, TOOL, input, SCOPES)
    const attempts = await listTestMcpCreateAttempts(caller.id)

    const second = await callStructuredMcpTool(caller, TOOL, input, SCOPES)

    expect(second).toEqual(first)
    expect(await listTestMcpCreateAttempts(caller.id)).toEqual(attempts)
    expect(attempts).toHaveLength(1)
    expect(await countTestModerationReportsByReporter(caller.id)).toBe(1)
  })

  it('rejects the same key with a changed request and leaves the first report alone', async () => {
    const caller = await createTestPlusMcpCaller()
    const input = args(await reportablePostId())
    await callStructuredMcpTool(caller, TOOL, input, SCOPES)
    const attempts = await listTestMcpCreateAttempts(caller.id)

    for (const changed of [{ reason: 'harassment' }, { note: 'Different' }]) {
      expect(await errorOf(caller, { ...input, ...changed })).toMatchObject({
        error: { status: 409, code: 'IDEMPOTENCY_KEY_REUSED', retryable: false },
      })
    }

    expect(await listTestMcpCreateAttempts(caller.id)).toEqual(attempts)
    expect(await countTestModerationReportsByReporter(caller.id)).toBe(1)
  })

  it('refuses direct calls without delegated context or with another owner', async () => {
    const caller = await createTestPlusMcpCaller()
    const input = args(await reportablePostId())
    await expect(createTool.function(caller)(input)).rejects.toMatchObject({ status: 403 })
    await expect(
      createTool.function(caller)(input, {
        credentialOwnerId: crypto.randomUUID(),
        grantedScopes: SCOPES,
      }),
    ).rejects.toMatchObject({ status: 403, message: 'Forbidden' })
    await expectNothingWritten(caller.id)
  })

  it('refuses a report of your own post or a post you cannot see and writes nothing', async () => {
    const caller = await createTestPlusMcpCaller()
    const ownPost = (await createTestPost({ user: caller }))!.id
    const privatePost = (await createTestPost({
      user: await createTestUser(),
      privacy: 'private',
      broadcast: 'users',
    }))!.id

    expect(await errorOf(caller, args(ownPost))).toMatchObject({
      error: { status: 422, code: 'INVALID_INPUT', message: 'Cannot report yourself' },
    })
    expect(await errorOf(caller, args(privatePost))).toMatchObject({
      error: { status: 404, code: 'NOT_FOUND' },
    })
    await expectNothingWritten(caller.id)
  })

  it.each([
    ['an unknown entity type', { entity_type: 'topic' }],
    ['an unknown reason', { reason: 'rude' }],
    ['a missing reason', { reason: undefined }],
    ['a malformed entity id', { entity_id: 'not-a-uuid' }],
    ['a non-uuid idempotency key', { idempotency_key: 'not-a-uuid' }],
    ['an unexpected field', { copyright: true }],
  ])('refuses %s before claiming a key', async (_label, extra) => {
    const caller = await createTestPlusMcpCaller()
    const text = await callRejectedMcpTool(
      caller,
      TOOL,
      args(await reportablePostId(), extra),
      SCOPES,
    )
    expect(text).toContain('Invalid tool arguments')
    await expectNothingWritten(caller.id)
  })

  it('refuses rules the shared parser owns, and an overlong note, writing nothing', async () => {
    const caller = await createTestPlusMcpCaller()
    const target = (await createTestUser()).id

    expect(
      await errorOf(caller, args(target, { entity_type: 'user', reason: 'vote_manipulation' })),
    ).toMatchObject({
      error: { status: 422, message: 'vote_manipulation reason is only valid for posts' },
    })
    expect(
      await errorOf(caller, args(await reportablePostId(), { note: 'x'.repeat(1001) })),
    ).toMatchObject({ error: { status: 422, message: 'Note must be 1000 characters or fewer' } })
    await expectNothingWritten(caller.id)
  })

  it('requires the write scope and the Plus plan', async () => {
    const caller = await createTestPlusMcpCaller()
    const input = args(await reportablePostId())

    expect(await callRejectedMcpTool(caller, TOOL, input, ['posts:write'])).toContain(
      'Tool requires scopes',
    )
    expect(
      await callRejectedMcpTool({ ...caller, membership_plan: null }, TOOL, input, SCOPES),
    ).toContain('requires a higher plan')
    await expectNothingWritten(caller.id)
  })

  it('refuses a suspended credential owner and writes nothing', async () => {
    const caller = await createTestPlusMcpCaller()
    const input = args(await reportablePostId())
    await suspendTestUser(caller.id)
    try {
      expect(await callRejectedMcpTool(caller, TOOL, input, SCOPES)).toContain('suspended')
    } finally {
      await unsuspendTestUser(caller.id)
    }
    await expectNothingWritten(caller.id)
  })
})
