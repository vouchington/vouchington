import { expect, test } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  insertTestPost,
  insertScoredPostTopicCategoryRelation,
} from '../../../backend/test-helpers/index.mts'

// Free/just_joined tier is capped at 3 manually-added topic tags per post (#8246). This seeds a
// post already at that cap (3 tags created by the test user) and adds a 4th via the real UI to
// exercise the actual 403 TAG_LIMIT_REACHED path, not a mocked one.
let suffix = ''
let FOURTH_TOPIC_NAME = ''

let userId: string
let postId: string

test.beforeAll(async () => {
  // A beforeAll can re-run in the same worker process when Playwright's
  // fullyParallel scheduler hands the worker a second test from this file —
  // module scope is preserved across that re-entry. Generating the suffix
  // here (not at module scope) guarantees fresh, non-colliding slugs and
  // topic names on every entry, since posts.slug and topics.slug/name are
  // globally unique keys.
  suffix = randomSuffix()
  FOURTH_TOPIC_NAME = `Tag Limit Fourth ${suffix}`

  const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  if (!user) throw new Error('Failed to create tag limit test user')
  userId = user.id

  postId = await insertTestPost({
    title: `Tag Limit Post ${suffix}`,
    slug: `pw-tag-limit-post-${suffix}`,
    createdById: userId,
    markdown: 'Root post for tag limit tests.',
    postType: 'discussion',
  })

  const existingTopics = await Promise.all(
    [0, 1, 2].map(i =>
      insertTestTopic(`Tag Limit Existing ${i} ${suffix}`, `tag-limit-existing-${i}-${suffix}`),
    ),
  )
  for (const topic of existingTopics) {
    await insertScoredPostTopicCategoryRelation(postId, topic.id, userId)
  }

  await insertTestTopic(FOURTH_TOPIC_NAME, `tag-limit-fourth-${suffix}`)
})

test.describe('Tag Limit', () => {
  test('shows upgrade CTA when the manual tag cap is reached', async ({ page }) => {
    await loginAsUser(page, userId)
    await navigateTo(page, `/discussion/${postId}/tags/topic`)

    const searchInput = page.getByTestId('tag-autocomplete-input-topic')
    await searchInput.pressSequentially(FOURTH_TOPIC_NAME)
    await page
      .getByTestId('tag-autocomplete-item-topic')
      .filter({ hasText: new RegExp(`^${FOURTH_TOPIC_NAME}$`) })
      .first()
      .click()

    const cta = page.getByTestId('tag-limit-cta')
    await expect(cta).toBeVisible()

    const upgradeLink = page.getByTestId('tag-limit-cta-upgrade')
    await expect(upgradeLink).toHaveAttribute('href', '/plans')
  })
})
