import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  getTestCommunityMember,
  insertTestCommunity,
  overrideDynamicConfigFieldsForTest,
  readTestContentProvenance,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { closeScopedDynamicConfigContext } from '@voucha/test-helpers/dynamic-config'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import { contributionLimitConfig } from '@services/contribution-gating/limits-config'
import { callRejectedMcpTool, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import {
  countTestCommunitiesCreatedBy,
  listTestMcpCreateAttempts,
  readTestCommunitySettings,
} from '@voucha/test-helpers/mcp-write-tool-rows'
import createTool from '../create-community.mts'

const SCOPES = ['communities:read', 'communities:write'] as const
const TOOL = 'create_community'

const args = (extra: Record<string, unknown> = {}) => ({
  idempotency_key: crypto.randomUUID(),
  name: 'Quiet Birdwatchers Of Lakeside',
  ...extra,
})
const expectNothingWritten = async (userId: string) => {
  expect(await countTestCommunitiesCreatedBy(userId)).toBe(0)
  expect(await listTestMcpCreateAttempts(userId)).toEqual([])
}
const errorOf = async (caller: Parameters<typeof callRejectedMcpTool>[0], input: object) =>
  JSON.parse(await callRejectedMcpTool(caller, TOOL, input as never, SCOPES))
// Tests raise every contribution limit, so a test about quota restores the Plus-plan production
// shape: one community per short window.
const withOneCommunityPerWindow = () =>
  overrideDynamicConfigFieldsForTest(contributionLimitConfig, { community_plus_short_limit: 1 })

describe('create_community — real store', () => {
  beforeAll(async () => {
    await contributionLimitConfig.waitForInitialization()
    contributionLimitConfig.unsubscribe()
  })
  afterAll(async () => {
    await closeScopedDynamicConfigContext([contributionLimitConfig])
  })

  it('creates a community the credential owner owns and returns only facts', async () => {
    const caller = await createTestPlusMcpCaller()

    const result = await callStructuredMcpTool(
      caller,
      TOOL,
      args({ slug: `lakeside-${crypto.randomUUID().slice(0, 8)}`, visibility: 'private' }),
      SCOPES,
    )

    expect(result).toEqual({
      success: true,
      community: {
        id: expect.any(String),
        slug: expect.stringMatching(/^lakeside-/),
        visibility: 'private',
        created_at: expect.any(String),
      },
    })
    const { id } = result.community as { id: string }
    expect(await readTestContentProvenance('communities', id)).toEqual({
      createdVia: 'mcp',
      oauthClientId: null,
    })
    expect(await getTestCommunityMember(id, caller.id)).toMatchObject({ role: 'owner' })
    expect(await countTestCommunitiesCreatedBy(caller.id)).toBe(1)
  })

  it('stores every option the caller sets', async () => {
    const caller = await createTestPlusMcpCaller()

    const result = await callStructuredMcpTool(
      caller,
      TOOL,
      args({
        member_roster_visibility: 'members',
        member_invites_allowed: true,
        post_approval_required: true,
        should_allow_review_posts: true,
        should_allow_data_point_posts: true,
        default_language: 'fr-FR',
      }),
      SCOPES,
    )

    expect(await readTestCommunitySettings((result.community as { id: string }).id)).toEqual({
      member_roster_visibility: 'members',
      member_invites_allowed: true,
      post_approval_required: true,
      should_allow_review_posts: true,
      should_allow_data_point_posts: true,
      default_language: 'fr',
    })
  })

  it('defaults to a public community with a generated slug', async () => {
    const caller = await createTestPlusMcpCaller()

    const result = await callStructuredMcpTool(caller, TOOL, args(), SCOPES)

    expect(result.community).toMatchObject({
      visibility: 'public',
      slug: expect.stringMatching(/^quiet-birdwatchers-of-lakeside-/),
    })
  })

  it('replays the first result for the same key and request, spending no quota', async () => {
    const caller = await createTestPlusMcpCaller()
    const input = args()
    const restore = withOneCommunityPerWindow()
    let first: Record<string, unknown>
    let second: Record<string, unknown>
    try {
      first = await callStructuredMcpTool(caller, TOOL, input, SCOPES)
      // One community per window, so a replay that spent quota would be refused.
      second = await callStructuredMcpTool(caller, TOOL, input, SCOPES)
    } finally {
      restore()
    }
    const attempts = await listTestMcpCreateAttempts(caller.id)

    expect(second).toEqual(first)
    expect(await listTestMcpCreateAttempts(caller.id)).toEqual(attempts)
    expect(attempts).toHaveLength(1)
    expect(await countTestCommunitiesCreatedBy(caller.id)).toBe(1)
  })

  it('rejects the same key with a changed request and leaves the first community alone', async () => {
    const caller = await createTestPlusMcpCaller()
    const input = args()
    await callStructuredMcpTool(caller, TOOL, input, SCOPES)
    const attempts = await listTestMcpCreateAttempts(caller.id)

    for (const changed of [
      { name: 'Another Quiet Birdwatchers Group' },
      { member_invites_allowed: true },
      { visibility: 'private' },
    ]) {
      expect(await errorOf(caller, { ...input, ...changed })).toMatchObject({
        error: { status: 409, code: 'IDEMPOTENCY_KEY_REUSED', retryable: false },
      })
    }

    expect(await listTestMcpCreateAttempts(caller.id)).toEqual(attempts)
    expect(await countTestCommunitiesCreatedBy(caller.id)).toBe(1)
  })

  it('applies the web quota to a second community and frees the refused key', async () => {
    const caller = await createTestPlusMcpCaller()
    const restore = withOneCommunityPerWindow()
    try {
      await callStructuredMcpTool(caller, TOOL, args(), SCOPES)

      expect(await errorOf(caller, args())).toMatchObject({
        error: { status: 429, code: 'CONTRIBUTION_QUOTA_EXCEEDED' },
      })
    } finally {
      restore()
    }

    expect(await countTestCommunitiesCreatedBy(caller.id)).toBe(1)
    expect(await listTestMcpCreateAttempts(caller.id)).toHaveLength(1)
  })

  it('refuses a taken slug and writes nothing', async () => {
    const caller = await createTestPlusMcpCaller()
    const taken = await insertTestCommunity({ createdById: (await createTestUser()).id })

    expect(await errorOf(caller, args({ slug: taken.slug }))).toMatchObject({
      error: { status: 409, code: 'CONFLICT' },
    })

    await expectNothingWritten(caller.id)
  })

  it('refuses an owner without a username, as the web does', async () => {
    const caller = await createTestPlusMcpCaller({ noUsername: true })

    expect(await errorOf(caller, args())).toMatchObject({
      error: { status: 403, message: 'A username is required to create a community' },
    })

    await expectNothingWritten(caller.id)
  })

  it('refuses direct calls without delegated context or with another owner', async () => {
    const caller = await createTestPlusMcpCaller()
    const input = args()
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
    ['a name of fewer than three words', { name: 'Two words' }, 'at least 3 words'],
    ['a name with surrounding whitespace', { name: ' Three Whole Words ' }, 'leading or trailing'],
    ['a name over 100 characters', { name: `${'word '.repeat(25)}end` }, '100 characters'],
    ['an invalid slug', { slug: 'Not A Slug' }, 'Slug must only contain'],
  ])('refuses %s before claiming a key', async (_label, extra, message) => {
    const caller = await createTestPlusMcpCaller()
    expect(await errorOf(caller, args(extra))).toMatchObject({
      error: { status: 422, code: 'INVALID_INPUT', message: expect.stringContaining(message) },
    })
    await expectNothingWritten(caller.id)
  })

  it.each([
    ['a missing name', { name: undefined }],
    ['an unknown visibility', { visibility: 'secret' }],
    ['an unknown roster visibility', { member_roster_visibility: 'everyone' }],
    ['a non-boolean flag', { post_approval_required: 'yes' }],
    ['a non-uuid idempotency key', { idempotency_key: 'not-a-uuid' }],
    ['an image id the tool does not take', { profile_image_id: crypto.randomUUID() }],
  ])('refuses %s as invalid arguments', async (_label, extra) => {
    const caller = await createTestPlusMcpCaller()
    const text = await callRejectedMcpTool(caller, TOOL, args(extra), SCOPES)
    expect(text).toContain('Invalid tool arguments')
    await expectNothingWritten(caller.id)
  })

  it('requires the write scope and the Plus plan', async () => {
    const caller = await createTestPlusMcpCaller()

    for (const scopes of [['communities:read'], ['posts:read', 'posts:write']] as const) {
      expect(await callRejectedMcpTool(caller, TOOL, args(), scopes)).toContain(
        'Tool requires scopes',
      )
    }
    expect(
      await callRejectedMcpTool({ ...caller, membership_plan: null }, TOOL, args(), SCOPES),
    ).toContain('requires a higher plan')
    await expectNothingWritten(caller.id)
  })

  it('refuses a suspended credential owner and writes nothing', async () => {
    const caller = await createTestPlusMcpCaller()
    await suspendTestUser(caller.id)
    try {
      expect(await callRejectedMcpTool(caller, TOOL, args(), SCOPES)).toContain('suspended')
    } finally {
      await unsuspendTestUser(caller.id)
    }
    await expectNothingWritten(caller.id)
  })
})
