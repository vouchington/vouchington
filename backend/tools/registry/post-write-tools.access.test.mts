import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  createTestMembership,
  suspendTestUser,
  unsuspendTestUser,
  setPostDeletedForTest,
  overrideDynamicConfigFieldsForTest,
  insertLegacyContributionAdmissionConsumptionForTest,
} from '@voucha/test-helpers'
import { callRejectedMcpTool, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { listScopeCatalog } from '@modules/scopes'
import { lockPost } from '@services/posts'
import { contributionLimitConfig } from '@services/contribution-gating/limits-config'
import { closeScopedDynamicConfigContext } from '@voucha/test-helpers/dynamic-config'

const SCOPES = ['posts:read', 'posts:write'] as const
const input = (fields: Record<string, unknown> = {}) => ({
  idempotency_key: crypto.randomUUID(),
  title: crypto.randomUUID(),
  markdown: 'Useful discussion content.',
  ...fields,
})
async function caller() {
  const user = await createTestUser()
  await createTestMembership({ user_id: user.id, plan: 'plus' })
  return { ...user, membership_plan: 'plus' as const }
}

describe('post MCP write guards — real services', () => {
  beforeAll(async () => {
    await contributionLimitConfig.waitForInitialization()
    contributionLimitConfig.unsubscribe()
  })
  afterAll(async () => {
    await closeScopedDynamicConfigContext([contributionLimitConfig])
  })
  it('publishes the write scope with its read prerequisite and generic consent metadata', () => {
    expect(listScopeCatalog()).toContainEqual({
      scope: 'posts:write',
      resource: 'posts',
      action: 'write',
      audience: 'user',
      description_key: null,
      requires: 'posts:read',
      surfaces: ['api-key', 'oauth'],
    })
  })

  it('requires write consent, a paid plan and an active account for every write', async () => {
    const user = await caller()
    const calls = [
      ['create_post', input()],
      ['update_post', { id: crypto.randomUUID(), title: 'Changed' }],
      ['delete_post', { id: crypto.randomUUID() }],
    ] as const
    for (const [name, args] of calls) {
      expect(await callRejectedMcpTool(user, name, args, ['posts:read'])).toContain(
        'Tool requires scopes',
      )
      expect(
        await callRejectedMcpTool({ ...user, membership_plan: null }, name, args, SCOPES),
      ).toContain('requires a higher plan')
    }
    await suspendTestUser(user.id)
    try {
      for (const [name, args] of calls)
        expect(await callRejectedMcpTool(user, name, args, SCOPES)).toContain('suspended')
    } finally {
      await unsuspendTestUser(user.id)
    }
  })

  it('returns the owner post-budget code through MCP', async () => {
    const user = await caller()
    const restore = overrideDynamicConfigFieldsForTest(contributionLimitConfig, {
      discussion_plus_short_limit: 1,
    })
    try {
      await insertLegacyContributionAdmissionConsumptionForTest({
        actorId: user.id,
        source: 'discussion',
      })
      expect(await callRejectedMcpTool(user, 'create_post', input(), SCOPES)).toContain(
        'CONTRIBUTION_QUOTA_EXCEEDED',
      )
    } finally {
      restore()
    }
  })

  it.each(['review', 'data_point'])(
    'refuses official-account %s contributions',
    async post_type => {
      const user = await createTestUser({ administrator: true })
      await createTestMembership({ user_id: user.id, plan: 'plus' })
      expect(
        await callRejectedMcpTool(
          { ...user, membership_plan: 'plus' },
          'create_post',
          input({ post_type }),
          SCOPES,
        ),
      ).toContain('Official accounts')
    },
  )

  it('preserves deleted ancestor placeholders and refuses locked threads', async () => {
    const user = await caller()
    const make = async (fields: Record<string, unknown> = {}) => {
      const result = await callStructuredMcpTool(user, 'create_post', input(fields), SCOPES)
      return (result.post as { id: string }).id
    }
    const root = await make()
    const middle = await make({ post_type: 'comment', parent_id: root })
    const leaf = await make({ post_type: 'comment', parent_id: middle })
    await setPostDeletedForTest(middle)
    expect(
      await callStructuredMcpTool(
        user,
        'create_post',
        input({ post_type: 'comment', parent_id: leaf }),
        SCOPES,
      ),
    ).toMatchObject({ post: { parent_id: leaf } })
    await lockPost(root, user.id)
    expect(
      await callRejectedMcpTool(
        user,
        'create_post',
        input({ post_type: 'comment', parent_id: leaf }),
        SCOPES,
      ),
    ).toContain('locked')
  })
})
