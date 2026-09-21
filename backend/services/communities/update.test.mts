import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  getTestPostPublicationDirtyWorkForScope,
  insertTestCommunity,
  insertTestImage,
  listTestPostPublicationRetainedTextKeys,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import * as psqlEnqueues from '@queues/psql/enqueues'
import { updateCommunity } from './update.mts'
import { getCommunity } from './get.mts'

describe('updateCommunity language handling', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser({ administrator: true })
  })

  it('accepts a valid ISO 639-1 default_language and normalises it on the community', async () => {
    const community = await insertTestCommunity({ createdById: user.id })

    await updateCommunity(user, community.id, { default_language: 'en' })

    const updated = await getCommunity(community.id)
    expect(updated!.default_language).toBe('en')
  })

  it('normalises a BCP-47 tag (en-US) to its ISO 639-1 base code', async () => {
    const community = await insertTestCommunity({ createdById: user.id })

    await updateCommunity(user, community.id, { default_language: 'en-US' })

    const updated = await getCommunity(community.id)
    // normalizeContentLanguageTag strips the region subtag → 'en'
    expect(updated!.default_language).toBe('en')
  })

  it('stores null when an unrecognised language tag is provided', async () => {
    const community = await insertTestCommunity({ createdById: user.id })

    await updateCommunity(user, community.id, { default_language: 'xx-invalid' })

    const updated = await getCommunity(community.id)
    expect(updated!.default_language).toBeNull()
  })

  it('clears default_language when null is passed', async () => {
    const community = await insertTestCommunity({ createdById: user.id })
    // First set a language
    await updateCommunity(user, community.id, { default_language: 'fr' })

    // Then clear it
    await updateCommunity(user, community.id, { default_language: null })

    const updated = await getCommunity(community.id)
    expect(updated!.default_language).toBeNull()
  })

  it('rejects a non-string default_language with 422', async () => {
    const community = await insertTestCommunity({ createdById: user.id })

    await expect(
      updateCommunity(user, community.id, {
        default_language: 123 as unknown as string,
      }),
    ).rejects.toMatchObject({ status: 422 })
  })
})

describe('updateCommunity publication capture', () => {
  it('records the locked prior slug when the community slug changes', async () => {
    const user = await createTestUser({ administrator: true })
    const community = await insertTestCommunity({ createdById: user.id })
    const priorSlug = community.slug

    await updateCommunity(user, community.id, { slug: `${priorSlug}-renamed` })

    const dirtyWork = await getTestPostPublicationDirtyWorkForScope({
      type: 'community',
      id: community.id,
    })
    expect(dirtyWork).toBeDefined()
    expect(dirtyWork!.reasons).toContain('community_visibility_changed')
    await expect(
      listTestPostPublicationRetainedTextKeys(dirtyWork!.id, 'identity_community_slug'),
    ).resolves.toContain(priorSlug)
  })
})

describe('updateCommunity top-hashtag refresh', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('enqueues only when a standalone visibility update changes eligibility', async () => {
    const user = await createTestUser({ administrator: true })
    const community = await insertTestCommunity({ createdById: user.id, visibility: 'public' })
    const refreshTopHashtags = vi.spyOn(psqlEnqueues, 'enqueueRefreshTopHashtags')

    await updateCommunity(user, community.id, { visibility: 'private' })
    expect(refreshTopHashtags).toHaveBeenCalledOnce()

    refreshTopHashtags.mockClear()
    await updateCommunity(user, community.id, { visibility: 'private' })
    expect(refreshTopHashtags).not.toHaveBeenCalled()
  })
})

describe('updateCommunity image surfaces', () => {
  it('accepts a profile and banner image change for an administrator', async () => {
    const user = await createTestUser({ administrator: true })
    const community = await insertTestCommunity({ createdById: user.id })
    const [profileImageId, bannerImageId] = await Promise.all([
      insertTestImage(user.id),
      insertTestImage(user.id),
    ])

    const updated = await updateCommunity(user, community.id, {
      profile_image_id: profileImageId,
      banner_image_id: bannerImageId,
      member_invites_allowed_at: new Date('2026-07-01T12:00:00.000Z'),
      post_approval_required_at: new Date('2026-07-01T12:00:00.000Z'),
    })
    expect(updated.profile_image_id).toBe(profileImageId)
    expect(updated.banner_image_id).toBe(bannerImageId)
  })
})
