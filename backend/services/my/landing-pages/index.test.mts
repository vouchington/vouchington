import { describe, expect, it } from 'vitest'
import {
  createTestReferralProgramLink,
  createTestUser,
  enableReferralProgramByTopicId,
} from '@voucha/test-helpers'
import { insertTestReview, insertTestTopic } from '@voucha/test-helpers/entities/topics'
import { createProfileLink } from '../profile-links.mts'
import { createMyLandingPage } from './create.mts'
import { deleteMyLandingPage } from './delete.mts'
import { getMyLandingPage } from './get.mts'
import { getMyLandingPageCandidates } from './candidates.mts'
import { getPublicLandingPage } from './public.mts'
import { listLandingPagesForUser } from './list.mts'
import { replaceMyLandingPageItems } from './replace-items.mts'
import { setMyLandingPageDefault } from './set-default.mts'
import { updateMyLandingPage } from './update.mts'
import type { PrivateUser } from '@services/users/types'
async function createTopicFixtures(user: PrivateUser) {
  const random = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const topicId = await insertTestTopic({
    name: `Landing Program ${random}`,
    slug: `landing-program-${random}`,
    createdById: user.id,
    topicType: 'referral_program',
  })
  await enableReferralProgramByTopicId(topicId)

  const reviewId = await insertTestReview({
    userId: user.id,
    title: 'Landing review',
    markdown: 'Landing review body',
    topicRatings: [{ topicId, rating: 5 }],
  })

  const profileLink = await createProfileLink(user.id, {
    link_type: 'url',
    url: 'https://example.com/profile-link',
    name: 'Profile link',
  })

  const referralLinkId = await createTestReferralProgramLink({
    userId: user.id,
    referralProgramId: topicId,
    url: 'https://example.com/referral-link',
    label: 'Referral CTA',
  })

  return {
    topicId,
    reviewId,
    profileLinkId: profileLink.id,
    referralLinkId,
  }
}

describe('landing page services', () => {
  it('manages page lifecycle, default switching, and slug conflicts', async () => {
    const user = await createTestUser()

    const primaryPage = await createMyLandingPage(user.id, {
      title: 'Primary links',
      slug: 'primary-links',
      subtitle: 'Primary subtitle',
    })
    const secondaryPage = await createMyLandingPage(user.id, {
      title: 'Secondary links',
      slug: 'secondary-links',
    })

    await expect(
      createMyLandingPage(user.id, {
        title: 'Duplicate slug',
        slug: 'primary-links',
      }),
    ).rejects.toMatchObject({ status: 409 })

    await expect(
      updateMyLandingPage(user.id, secondaryPage.id, {
        slug: 'primary-links',
      }),
    ).rejects.toMatchObject({ status: 409 })

    await setMyLandingPageDefault(user.id, secondaryPage.id)
    const pagesAfterDefault = await listLandingPagesForUser(user.id)

    expect(pagesAfterDefault).toHaveLength(2)
    expect(pagesAfterDefault[0]?.id).toBe(secondaryPage.id)
    expect(pagesAfterDefault[0]?.is_default).toBe(true)

    await deleteMyLandingPage(user.id, secondaryPage.id)
    const pagesAfterDelete = await listLandingPagesForUser(user.id)

    expect(pagesAfterDelete).toHaveLength(1)
    expect(pagesAfterDelete[0]?.id).toBe(primaryPage.id)
    expect(pagesAfterDelete[0]?.is_default).toBe(true)
  })

  it('lists candidates and persists ordered mixed landing page items', async () => {
    const user = await createTestUser()
    const fixtures = await createTopicFixtures(user)
    const page = await createMyLandingPage(user.id, {
      title: 'Mixed links',
      slug: 'mixed-links',
    })

    const candidates = await getMyLandingPageCandidates(user.id)
    expect(candidates.can_create_landing_pages).toBe(true)
    expect(candidates.profile_links.some(link => link.id === fixtures.profileLinkId)).toBe(true)
    expect(candidates.reviews.some(review => review.id === fixtures.reviewId)).toBe(true)
    expect(candidates.referral_links.some(link => link.id === fixtures.referralLinkId)).toBe(true)

    await expect(
      replaceMyLandingPageItems(user.id, page.id, [
        { type: 'review', review_id: fixtures.reviewId },
        {
          type: 'topic_group',
          topic_id: fixtures.topicId,
          entries: [{ type: 'review', review_id: fixtures.reviewId }],
        },
      ]),
    ).rejects.toMatchObject({ status: 400 })

    await expect(
      replaceMyLandingPageItems(user.id, page.id, [
        {
          type: 'topic_group',
          topic_id: fixtures.topicId,
          entries: [{ type: 'review', review_id: fixtures.reviewId }],
        },
        {
          type: 'topic_group',
          topic_id: fixtures.topicId,
          entries: [{ type: 'referral_link', referral_link_id: fixtures.referralLinkId }],
        },
      ]),
    ).rejects.toMatchObject({ status: 400 })

    await expect(
      replaceMyLandingPageItems(user.id, page.id, [{ type: 'evil' } as never]),
    ).rejects.toMatchObject({ status: 400 })

    await replaceMyLandingPageItems(user.id, page.id, [
      { type: 'profile_link', profile_link_id: fixtures.profileLinkId },
      {
        type: 'topic_group',
        topic_id: fixtures.topicId,
        entries: [
          { type: 'review', review_id: fixtures.reviewId },
          { type: 'referral_link', referral_link_id: fixtures.referralLinkId },
        ],
      },
    ])

    const landingPage = await getMyLandingPage(user.id, page.id)
    expect(landingPage.items).toHaveLength(2)
    expect(landingPage.items[0]?.type).toBe('profile_link')
    expect(landingPage.items[1]?.type).toBe('topic_group')
    expect(
      landingPage.items[1]?.type === 'topic_group' && landingPage.items[1].entries,
    ).toHaveLength(2)
  })

  it('persists and resolves free-form link items', async () => {
    const user = await createTestUser()
    const page = await createMyLandingPage(user.id, { title: 'Link page', slug: 'link-page' })

    await replaceMyLandingPageItems(user.id, page.id, [
      { type: 'link', label: '  My Website  ', url: '  https://example.com/test  ' },
    ])

    const resolved = await getMyLandingPage(user.id, page.id)
    expect(resolved.items).toHaveLength(1)
    expect(resolved.items[0]).toMatchObject({
      type: 'link',
      label: 'My Website',
      url: 'https://example.com/test',
    })
  })

  it('reports landing page creation as unavailable until the user has a username', async () => {
    const user = await createTestUser({ noUsername: true })

    const candidates = await getMyLandingPageCandidates(user.id)

    expect(candidates.can_create_landing_pages).toBe(false)
  })

  it('rejects link items with invalid URLs', async () => {
    const user = await createTestUser()
    const page = await createMyLandingPage(user.id, { title: 'Bad link', slug: 'bad-link-page' })

    const scriptUrl = 'javascript:alert(1)'
    await expect(
      replaceMyLandingPageItems(user.id, page.id, [
        { type: 'link', label: 'Evil', url: scriptUrl },
      ]),
    ).rejects.toMatchObject({ status: 400 })

    await expect(
      replaceMyLandingPageItems(user.id, page.id, [{ type: 'link', label: 'Empty', url: '' }]),
    ).rejects.toMatchObject({ status: 400 })

    await expect(
      replaceMyLandingPageItems(user.id, page.id, [
        { type: 'link', label: '', url: 'https://example.com' },
      ]),
    ).rejects.toMatchObject({ status: 400 })

    const tooLongUrl = `https://example.com/${'a'.repeat(2048)}`
    await expect(
      replaceMyLandingPageItems(user.id, page.id, [
        { type: 'link', label: 'Long', url: tooLongUrl },
      ]),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('returns public landing pages for the default page and slug pages', async () => {
    const user = await createTestUser()
    const profileLink = await createProfileLink(user.id, {
      link_type: 'url',
      url: 'https://example.com/public-link',
      name: 'Public link',
    })

    const defaultPage = await createMyLandingPage(user.id, {
      title: 'Default links',
      slug: 'default-links',
    })
    const bonusPage = await createMyLandingPage(user.id, {
      title: 'Bonus links',
      slug: 'bonus-links',
    })

    await replaceMyLandingPageItems(user.id, defaultPage.id, [
      { type: 'profile_link', profile_link_id: profileLink.id },
    ])
    await replaceMyLandingPageItems(user.id, bonusPage.id, [
      { type: 'profile_link', profile_link_id: profileLink.id },
    ])

    const defaultPublicPage = await getPublicLandingPage(user.username!)
    const slugPublicPage = await getPublicLandingPage(user.username!, 'bonus-links')

    expect(defaultPublicPage?.landing_page.title).toBe('Default links')
    expect(defaultPublicPage?.user.username).toBe(user.username)
    expect(slugPublicPage?.landing_page.title).toBe('Bonus links')
    expect(slugPublicPage?.landing_page.slug).toBe('bonus-links')
  })
})
