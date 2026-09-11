import { expect, test } from '../../helpers/test.mts'
import {
  createTestPost,
  createTestUser,
  followUser,
  setUserMarkdown,
} from '../../../backend/test-helpers/index.mts'
import { createRandomString } from '../../../backend/test-helpers/data.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { createProfileLink } from '../../../backend/services/my/profile-links.mts'
import { getAsideLocator } from '../../helpers/aside-locator.mts'

test.describe('Post Author Aside', () => {
  let authorId: string
  let authorUsername: string
  let viewerId: string
  let postSlug: string

  test.beforeAll(async () => {
    const unique = createRandomString(12)
    const author = await createTestUser()
    const viewer = await createTestUser()

    authorId = author!.id
    authorUsername = author!.username!
    viewerId = viewer!.id

    // Set author bio
    await setUserMarkdown(authorId, 'I write about travel and credit cards.')

    // Add a GitHub profile link
    await createProfileLink(authorId, {
      link_type: 'github',
      handle: `pw-author-${unique}`,
    })

    // Viewer follows the author
    await followUser(viewer!, author!)

    // Create post by author
    const post = await createTestPost({
      user: author!,
      title: `Author Aside Test ${unique}`,
      slug: `author-aside-test-${unique}`,
      post_type: 'discussion',
      markdown: 'Testing the author aside panel.',
    })
    postSlug = post.slug ?? post.id
  })

  test('byline is a link to author profile', async ({ page }) => {
    await navigateTo(page, `/discussion/${postSlug}`)
    const bylineLink = page.getByTestId('post-detail-byline-link')
    await expect(bylineLink).toBeVisible()
    await expect(bylineLink).toHaveAttribute('href', new RegExp(`/user/${authorUsername}`))
  })

  test('author aside shows username, bio excerpt, and Follow button for viewer', async ({
    page,
  }) => {
    await loginAsUser(page, viewerId)
    await navigateTo(page, `/discussion/${postSlug}`)

    // Author aside heading
    await expect(page.getByTestId('post-author-aside-heading')).toBeVisible()

    // Author username link in aside
    await expect(page.getByTestId('post-author-aside-user-link')).toContainText(authorUsername)

    // Bio text is shown
    await expect(page.getByTestId('post-author-aside-bio')).toContainText(/I write about travel/)

    // "Read more" link shown when bio exists
    await expect(page.getByTestId('post-author-aside-read-more')).toBeVisible()

    // Follow button shown for viewer (not the author).
    await expect(getAsideLocator(page, 'follow-button')).toBeVisible()
  })

  test('author aside shows GitHub social link', async ({ page }) => {
    await navigateTo(page, `/discussion/${postSlug}`)
    const githubLink = page.getByTestId('profile-link-github')
    await expect(githubLink).toBeVisible()
    await expect(githubLink).toHaveAttribute('target', '_blank')
  })

  test('author visiting own post does not see Follow button', async ({ page }) => {
    await loginAsUser(page, authorId)
    await navigateTo(page, `/discussion/${postSlug}`)

    // Author aside heading should be present
    await expect(page.getByTestId('post-author-aside-heading')).toBeVisible()

    // Follow button must not appear (author viewing own post)
    await expect(page.getByTestId('follow-button')).toHaveCount(0)
  })
})
