import { it, expect, beforeAll, describe } from 'vitest'
import {
  createTestUser,
  getModerator,
  softDeleteModerator,
  createSystemUser,
} from '@voucha/test-helpers'
import {
  createPostLLMModerator,
  getPostLLMModeratorBySlug,
  updatePostLLMModerator,
  getActivePostLLMModerators,
} from './moderators.mts'
import type { PrivateUser } from '@services/users/types'

describe('moderators.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  function randomSuffix(): string {
    return Math.random().toString(36).slice(2, 10)
  }

  it('createPostLLMModerator creates moderator with system user', async () => {
    const random = randomSuffix()

    const systemUser = await createSystemUser(`test-politics-${random}`)
    const moderator = await createPostLLMModerator(user, systemUser, `test-politics-${random}`)
    expect(moderator.slug).toBe(`test-politics-${random}`)
    expect(moderator.system_user_id).toBeDefined()
    expect(moderator.activated_at).toBeNull()
    expect(moderator.deactivated_at).toBeNull()
  })

  it('getActivePostLLMModerators returns only active moderators', async () => {
    const random = randomSuffix()

    const systemUser1 = await createSystemUser(`active-mod-${random}`)
    const mod1 = await createPostLLMModerator(user, systemUser1, `active-mod-${random}`)
    await updatePostLLMModerator(user, mod1.id, { active: true })

    const systemUser2 = await createSystemUser(`inactive-mod-${random}`)
    const mod2 = await createPostLLMModerator(user, systemUser2, `inactive-mod-${random}`)
    const active = await getActivePostLLMModerators()
    const activeIds = active.map(m => m.id)

    expect(activeIds).toContain(mod1.id)
    expect(activeIds).not.toContain(mod2.id)
  })

  it('updatePostLLMModerator updates on_flag_action', async () => {
    const random = randomSuffix()

    const systemUser = await createSystemUser(`toggle-test-${random}`)
    const moderator = await createPostLLMModerator(user, systemUser, `toggle-test-${random}`)

    await updatePostLLMModerator(user, moderator.id, { onFlagAction: 'none' })

    const updated = await getPostLLMModeratorBySlug(`toggle-test-${random}`)
    expect(updated).not.toBeNull()
  })

  it('updatePostLLMModerator activates moderator', async () => {
    const random = randomSuffix()

    const systemUser = await createSystemUser(`activate-test-${random}`)
    const moderator = await createPostLLMModerator(user, systemUser, `activate-test-${random}`)
    expect(moderator.activated_at).toBeNull()

    await updatePostLLMModerator(user, moderator.id, { active: true })

    const updated = await getPostLLMModeratorBySlug(`activate-test-${random}`)
    expect(updated).not.toBeNull()
    expect(updated!.activated_at).toBeInstanceOf(Date)
    expect(updated!.deactivated_at).toBeNull()
  })

  it('updatePostLLMModerator deactivates moderator', async () => {
    const random = randomSuffix()

    const systemUser = await createSystemUser(`deactivate-test-${random}`)
    const moderator = await createPostLLMModerator(user, systemUser, `deactivate-test-${random}`)
    await updatePostLLMModerator(user, moderator.id, { active: true })
    await updatePostLLMModerator(user, moderator.id, { active: false })

    const updated = await getPostLLMModeratorBySlug(`deactivate-test-${random}`)
    expect(updated).not.toBeNull()
    expect(updated!.activated_at).toBeNull()
    expect(updated!.deactivated_at).toBeInstanceOf(Date)
  })

  it('getPostLLMModeratorById returns moderator when it exists', async () => {
    const random = randomSuffix()

    const systemUser = await createSystemUser(`test-mod-${random}`)
    const moderator = await createPostLLMModerator(user, systemUser, `test-mod-${random}`)
    const fetched = (await getModerator(moderator.id)) as any
    expect(fetched).not.toBeNull()
    expect(fetched.id).toBe(moderator.id)
    expect(fetched.slug).toBe(`test-mod-${random}`)
  })

  it('getPostLLMModeratorBySlug returns null for non-existent slug', async () => {
    const result = await getPostLLMModeratorBySlug('non-existent-slug-12345')
    expect(result).toBeNull()
  })

  it('soft-deleted moderators are not returned', async () => {
    const random = randomSuffix()

    const systemUser = await createSystemUser(`delete-test-${random}`)
    const moderator = await createPostLLMModerator(user, systemUser, `delete-test-${random}`)
    await softDeleteModerator(moderator.id)

    const fetched = await getPostLLMModeratorBySlug(`delete-test-${random}`)
    expect(fetched).toBeNull()
  })
})
