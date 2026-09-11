import { expect, test } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import {
  createTestUser,
  insertTestPost,
  insertTestTopic,
} from '../../../backend/test-helpers/index.mts'
let hostSlug = ''
let rootSlug = ''
let commentId = ''
let mentionUsername = ''
let topicSlug = ''
const CANONICAL_BASE_URL = 'https://voucha.ai'

test.beforeAll(async () => {
  const random = randomSuffix()

  const author = await createTestUser({ username: `md-author-${random}` })
  const mentionedUser = await createTestUser({ username: `md-target-${random}` })
  if (!author) throw new Error('createTestUser returned null for author')
  if (!mentionedUser?.username)
    throw new Error('createTestUser returned no username for mentionedUser')

  mentionUsername = mentionedUser.username
  topicSlug = `md-topic-${random}`
  await insertTestTopic({
    name: `Markdown Topic ${random}`,
    slug: topicSlug,
    createdById: author.id,
  })
  rootSlug = `md-root-${random}`
  const rootPostId = await insertTestPost({
    title: `Markdown Root ${random}`,
    slug: rootSlug,
    createdById: author.id,
    markdown: 'Root content',
  })
  commentId = await insertTestPost({
    title: '',
    slug: `md-comment-${random}`,
    createdById: author.id,
    markdown: 'Comment body',
    postType: 'comment',
    rootId: rootPostId,
    parentId: rootPostId,
  })
  await insertTestPost({
    title: `Referenced Post ${random}`,
    slug: `md-ref-${random}`,
    createdById: author.id,
    markdown: 'Referenced content',
  })
  hostSlug = `md-host-${random}`
  await insertTestPost({
    title: `Markdown Host ${random}`,
    slug: hostSlug,
    createdById: author.id,
    markdown: [
      `Hello @${mentionUsername}`,
      `Topic #${topicSlug}`,
      `Post !md-ref-${random}`,
      `Comment !${CANONICAL_BASE_URL}/discussion/${rootSlug}/comment/${commentId}`,
      'Ignore email@test.com',
      'Ignore midword#topic',
    ].join('\n\n'),
  })
})

test.describe('Markdown HTML Rendering', () => {
  test('renders validated mention links and leaves invalid text unchanged', async ({ page }) => {
    await navigateTo(page, `/discussion/${hostSlug}`)

    const userLink = page.locator(`a[href="/user/${mentionUsername}"]`)
    await expect(userLink).toBeVisible()

    const topicLink = page.locator(`a[href="/topics/${topicSlug}"]`)
    await expect(topicLink).toBeVisible()

    const postLink = page.locator('a[href*="/discussion/md-ref-"]')
    await expect(postLink).toBeVisible()

    const commentLink = page.locator(`a[href="/discussion/${rootSlug}/comment/${commentId}"]`)
    await expect(commentLink).toBeVisible()

    const content = page.getByTestId('post-detail-content')
    await expect(content).toContainText('email@test.com')
    await expect(page.locator('a.md-link-user[href*="email@test.com"]')).toHaveCount(0)
    await expect(page.locator('a.md-link-topic[href*="email@test.com"]')).toHaveCount(0)
    await expect(content).toContainText('midword#topic')
  })
})
