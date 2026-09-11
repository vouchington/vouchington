import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { archiveCommunity } from '@services/communities/archive'
import {
  AI_GENERATED_MODERATOR_SLUG,
  disableCommunityAutoTaggerAgent,
  enableCommunityAutoTaggerAgent,
  getDisabledCommunityAutoTaggerModeratorSlugs,
  getEnabledCommunityAutoTaggerModeratorSlugs,
  searchCommunityAutoTaggerAgents,
  SELF_PROMOTION_MODERATOR_SLUG,
} from './index.mts'

describe('community auto taggers', () => {
  it('returns the fixed-label agent matrix disabled by default', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `ai-agents-matrix-${createRandomString(8)}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
    })

    const agents = await searchCommunityAutoTaggerAgents(owner, community.id)
    const selfPromotion = agents.find(agent => agent.slug === SELF_PROMOTION_MODERATOR_SLUG)
    const marketplace = agents.find(agent => agent.slug === 'marketplace')

    expect(agents.map(agent => agent.slug)).toEqual([
      'self-promotion',
      'marketplace',
      'ai-generated',
      'politics-averse',
      'click-bait',
      'vague-post',
      'shit-post',
    ])
    expect(selfPromotion).toMatchObject({
      system_username: 'self-promotion',
      label_topic_slugs: ['self-promotion'],
      enabled: false,
      entitlement: { allowed: true, reason: null },
    })
    expect(marketplace?.label_topic_slugs).toEqual([
      'buying',
      'selling',
      'trade',
      'for-hire',
      'hiring',
    ])
  })

  it('enables and disables an agent idempotently', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `ai-agents-toggle-${createRandomString(8)}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
    })

    await enableCommunityAutoTaggerAgent(owner, community.id, SELF_PROMOTION_MODERATOR_SLUG)
    const enabledAgain = await enableCommunityAutoTaggerAgent(
      owner,
      community.id,
      SELF_PROMOTION_MODERATOR_SLUG,
    )
    expect(enabledAgain.enabled).toBe(true)
    await expect(getEnabledCommunityAutoTaggerModeratorSlugs(community.id)).resolves.toEqual([
      SELF_PROMOTION_MODERATOR_SLUG,
    ])

    const disabled = await disableCommunityAutoTaggerAgent(
      owner,
      community.id,
      SELF_PROMOTION_MODERATOR_SLUG,
    )
    expect(disabled.enabled).toBe(false)
    await expect(getEnabledCommunityAutoTaggerModeratorSlugs(community.id)).resolves.toEqual([])
  })

  it('rejects non-moderators and unknown agent slugs', async () => {
    const [owner, member] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertTestCommunity({
      createdById: owner!.id,
      slug: `ai-agents-auth-${createRandomString(8)}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: member!.id,
      role: 'member',
    })

    await expect(
      enableCommunityAutoTaggerAgent(member!, community.id, SELF_PROMOTION_MODERATOR_SLUG),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      enableCommunityAutoTaggerAgent(owner!, community.id, 'not-real'),
    ).rejects.toMatchObject({
      status: 404,
    })
  })

  it('rejects community owner trying to toggle baseline moderator, allows admin', async () => {
    const [owner, admin] = await Promise.all([
      createTestUser(),
      createTestUser({ administrator: true }),
    ])
    const community = await insertTestCommunity({
      createdById: owner!.id,
      slug: `ai-agents-baseline-${createRandomString(8)}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner!.id,
      role: 'owner',
    })

    await expect(
      enableCommunityAutoTaggerAgent(owner!, community.id, AI_GENERATED_MODERATOR_SLUG),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      disableCommunityAutoTaggerAgent(owner!, community.id, AI_GENERATED_MODERATOR_SLUG),
    ).rejects.toMatchObject({ status: 403 })

    const disabled = await disableCommunityAutoTaggerAgent(
      admin!,
      community.id,
      AI_GENERATED_MODERATOR_SLUG,
    )
    expect(disabled.enabled).toBe(false)
    expect(disabled.always_on).toBe(true)
    await expect(getDisabledCommunityAutoTaggerModeratorSlugs(community.id)).resolves.toContain(
      AI_GENERATED_MODERATOR_SLUG,
    )

    const reenabled = await enableCommunityAutoTaggerAgent(
      admin!,
      community.id,
      AI_GENERATED_MODERATOR_SLUG,
    )
    expect(reenabled.enabled).toBe(true)
  })

  it('rejects toggling agents in archived communities', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `ai-agents-archived-${createRandomString(8)}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
    })
    await archiveCommunity(community.id, owner.id)

    await expect(
      enableCommunityAutoTaggerAgent(owner, community.id, SELF_PROMOTION_MODERATOR_SLUG),
    ).rejects.toMatchObject({ status: 403, message: 'Community is archived' })
    await expect(
      disableCommunityAutoTaggerAgent(owner, community.id, SELF_PROMOTION_MODERATOR_SLUG),
    ).rejects.toMatchObject({ status: 403, message: 'Community is archived' })
  })
})
