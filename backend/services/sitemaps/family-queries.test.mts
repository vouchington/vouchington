import { randomUUID } from 'node:crypto'
import {
  createTestUser,
  insertTestCommunity,
  insertTestTopic,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import { deleteTestCommunity } from '@voucha/test-helpers/entities/community-archive'
import { softDeleteUser, suspendTestUser } from '@voucha/test-helpers/entities/users-lifecycle'
import { setUrlHostnameVotes } from '@voucha/test-helpers/entities/url-hostnames/votes'
import { describe, expect, it } from 'vitest'
import { readSitemapFamilyPage } from './family-queries.mts'

describe('sitemap family pages', () => {
  it('bounds the initial page without a high-water cursor', async () => {
    await createTestUser()
    await createTestUser()

    const page = await readSitemapFamilyPage('users', { limit: 1 })
    expect(page).toHaveLength(1)
  })

  it('resumes within one topic after its first path', async () => {
    const user = await createTestUser()
    const slug = `sitemap-topic-${randomUUID()}`
    const id = await insertTestTopic({ name: slug, slug, createdById: user.id })
    const first = await readSitemapFamilyPage('topics', { highWaterId: id, limit: 1 })
    expect(first[0]).toMatchObject({ id })
    const second = await readSitemapFamilyPage('topics', {
      highWaterId: id,
      afterId: id,
      afterPath: first[0]!.path,
      limit: 1,
    })
    expect(second[0]).toMatchObject({ id })
    expect(second[0]!.path.localeCompare(first[0]!.path)).toBeGreaterThan(0)
  })

  it('includes only live, unsuspended owned users', async () => {
    const deleted = await createTestUser()
    await softDeleteUser(deleted.id)
    const suspended = await createTestUser()
    await suspendTestUser(suspended.id)
    const active = await createTestUser()
    const secondActive = await createTestUser()
    const [newer, older] = [active, secondActive].toSorted((left, right) =>
      right.id.localeCompare(left.id),
    )

    const page = await readSitemapFamilyPage('users', { highWaterId: newer.id, limit: 25 })
    expect(page).toContainEqual(
      expect.objectContaining({ id: newer.id, path: `/user/${newer.username}` }),
    )
    for (const excludedId of [deleted.id, suspended.id]) {
      const excludedPage = await readSitemapFamilyPage('users', {
        highWaterId: excludedId,
        limit: 1,
      })
      expect(excludedPage.some(row => row.id === excludedId)).toBe(false)
    }
    const resumed = await readSitemapFamilyPage('users', {
      highWaterId: newer.id,
      afterId: newer.id,
      limit: 25,
    })
    expect(resumed).toContainEqual(
      expect.objectContaining({ id: older.id, path: `/user/${older.username}` }),
    )
    expect(resumed.some(row => row.id === newer.id)).toBe(false)
  })

  it('emits indexable topic subpages without discussions', async () => {
    const user = await createTestUser()
    const hiddenSlug = `hidden-sitemap-${randomUUID()}`
    const hidden = await insertTestTopic({
      name: hiddenSlug,
      slug: hiddenSlug,
      createdById: user.id,
      is_noindexed: true,
    })
    const noReviewSlug = `no-review-sitemap-${randomUUID()}`
    const withoutReviews = await insertTestTopic({
      name: noReviewSlug,
      slug: noReviewSlug,
      createdById: user.id,
      allowReviews: false,
    })
    const referralSlug = `referral-sitemap-${randomUUID()}`
    const referral = await insertTestTopic({
      name: referralSlug,
      slug: referralSlug,
      createdById: user.id,
      topicType: 'referral_program',
    })
    const slug = `visible-sitemap-${randomUUID()}`
    const visible = await insertTestTopic({
      name: slug,
      slug,
      createdById: user.id,
    })

    const page = await readSitemapFamilyPage('topics', { highWaterId: visible, limit: 5 })
    const paths = page.filter(row => row.id === visible).map(row => row.path)
    expect(paths).toHaveLength(5)
    expect(paths).toEqual(
      expect.arrayContaining(
        ['posts', 'data-points', 'latest', 'news', 'reviews'].map(subpage =>
          expect.stringMatching(new RegExp(`/${slug}/${subpage}$`)),
        ),
      ),
    )
    const hiddenPage = await readSitemapFamilyPage('topics', { highWaterId: hidden, limit: 1 })
    expect(hiddenPage.some(row => row.id === hidden)).toBe(false)
    const withoutReviewsPage = await readSitemapFamilyPage('topics', {
      highWaterId: withoutReviews,
      limit: 5,
    })
    const withoutReviewsPaths = withoutReviewsPage
      .filter(row => row.id === withoutReviews)
      .map(row => row.path)
    expect(withoutReviewsPaths).toHaveLength(4)
    expect(withoutReviewsPaths.some(path => path.endsWith('/reviews'))).toBe(false)
    const referralPage = await readSitemapFamilyPage('topics', { highWaterId: referral, limit: 6 })
    expect(
      referralPage.some(row => row.id === referral && row.path.endsWith('/referral-links')),
    ).toBe(true)
  })

  it('includes only public, live owned communities', async () => {
    const user = await createTestUser()
    const privateCommunity = await insertTestCommunity({
      createdById: user.id,
      visibility: 'private',
    })
    const deletedCommunity = await insertTestCommunity({ createdById: user.id })
    await deleteTestCommunity({ communityId: deletedCommunity.id, deletedById: user.id })
    const publicCommunity = await insertTestCommunity({ createdById: user.id })

    const page = await readSitemapFamilyPage('communities', {
      highWaterId: publicCommunity.id,
      limit: 1,
    })
    expect(page).toContainEqual(
      expect.objectContaining({
        id: publicCommunity.id,
        path: `/communities/${publicCommunity.slug}`,
      }),
    )
    for (const excludedId of [privateCommunity.id, deletedCommunity.id]) {
      const excludedPage = await readSitemapFamilyPage('communities', {
        highWaterId: excludedId,
        limit: 1,
      })
      expect(excludedPage.some(row => row.id === excludedId)).toBe(false)
    }
  })

  it('includes only introduced, voted, unblocked owned domains', async () => {
    const unvoted = await insertTestUrlHostname({ hostname: `unvoted-${randomUUID()}.example.com` })
    const blocked = await insertTestUrlHostname({
      hostname: `blocked-${randomUUID()}.example.com`,
      is_blocked: true,
    })
    await setUrlHostnameVotes(blocked, 1, 0)
    const hostname = `public-${randomUUID()}.example.com`
    const publicId = await insertTestUrlHostname({ hostname })
    await setUrlHostnameVotes(publicId, 1, 0)

    const page = await readSitemapFamilyPage('domains', { highWaterId: publicId, limit: 1 })
    expect(page).toContainEqual(
      expect.objectContaining({ id: publicId, path: `/domain/${hostname}` }),
    )
    for (const excludedId of [unvoted, blocked]) {
      const excludedPage = await readSitemapFamilyPage('domains', {
        highWaterId: excludedId,
        limit: 1,
      })
      expect(excludedPage.some(row => row.id === excludedId)).toBe(false)
    }
  })
})
