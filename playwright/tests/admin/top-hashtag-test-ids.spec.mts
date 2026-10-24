import { test, expect, protectPlaywrightHookTimeouts } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo, randomSuffix, requireTestValue } from 'vouchington-tooling/playwright'
import {
  createTestUser,
  insertTestPost,
  insertTestTopic,
  createTopHashtagAliasForTest,
  createTopHashtagPostSourceForTest,
} from '../../../backend/test-helpers/index.mts'
import { createUnlinkedTopicAlias } from '../../../backend/services/topics/aliases.mts'
import { refreshMaterializedView } from '../../../backend/data-stores/psql/migrate.mts'

test.describe('Top hashtag controls', () => {
  test.use({ storageState: AUTH_STATE })

  let unlinkedHashtag = ''
  let linkedHashtag = ''

  test.beforeAll(async () => {
    protectPlaywrightHookTimeouts(test.info())
    const suffix = randomSuffix()
    const owner = requireTestValue(await createTestUser(), 'Failed to create hashtag owner')
    const topicId = await insertTestTopic({
      name: `Hashtag destination ${suffix}`,
      slug: `hashtag-destination-${suffix}`,
      createdById: owner.id,
    })
    linkedHashtag = `pw-linked-hashtag-${suffix}`
    const linkedAliasId = await createTopHashtagAliasForTest(topicId, linkedHashtag)
    const aliases = await Promise.all(
      Array.from({ length: 26 }, async (_, index) => {
        const hashtag = `pw-unlinked-hashtag-${suffix}-${index}`
        const alias = await createUnlinkedTopicAlias(`#${hashtag}`)
        return { hashtag, aliasId: alias.id }
      }),
    )
    unlinkedHashtag = requireTestValue(aliases[0], 'Missing first hashtag alias').hashtag
    const contributors = await Promise.all(
      Array.from({ length: 3 }, async (_, index) => {
        const user = requireTestValue(
          await createTestUser(),
          'Failed to create hashtag contributor',
        )
        const postId = await insertTestPost({
          title: `Hashtag source ${suffix} ${index}`,
          slug: `hashtag-source-${suffix}-${index}`,
          createdById: user.id,
          markdown: 'Public hashtag source.',
        })
        return { postId, userId: user.id }
      }),
    )
    await Promise.all(
      [{ hashtag: linkedHashtag, aliasId: linkedAliasId }, ...aliases].flatMap(
        ({ hashtag, aliasId }) =>
          contributors.map(({ postId, userId }) =>
            createTopHashtagPostSourceForTest({
              postId,
              topicAliasId: aliasId,
              userId,
              authoredToken: `#${hashtag}`,
            }),
          ),
      ),
    )
    await refreshMaterializedView('mv_top_hashtags')
  })

  test('shows mapping, row actions, linking form, and pagination', async ({ page }) => {
    await navigateTo(page, '/topic-recommendations')
    await page.getByTestId('top-hashtags-tab').click()
    await expect(page.getByTestId('top-hashtags-load-more')).toBeVisible()
    await page.getByTestId('top-hashtags-search').pressSequentially(unlinkedHashtag)
    await page.getByTestId('top-hashtags-search').press('Enter')
    const unlinkedRow = page.locator('li', { hasText: `#${unlinkedHashtag}` })
    await expect(unlinkedRow.getByTestId('top-hashtag-row-link-topic')).toBeVisible()
    await expect(unlinkedRow.getByTestId('top-hashtag-row-create-topic')).toBeVisible()
    await unlinkedRow.getByTestId('top-hashtag-row-link-topic').click()
    await expect(page.getByTestId('top-hashtag-link-form-link-topic')).toBeVisible()
    await expect(page.getByTestId('top-hashtag-link-form-cancel')).toBeVisible()
    await page.getByTestId('top-hashtag-link-form-cancel').click()

    const search = page.getByTestId('top-hashtags-search')
    await search.press('ControlOrMeta+A')
    await search.press('Backspace')
    await search.pressSequentially(linkedHashtag)
    await search.press('Enter')
    const linkedRow = page.locator('li', { hasText: `#${linkedHashtag}` })
    await expect(linkedRow.getByTestId('top-hashtag-row-unlink')).toBeVisible()
  })
})
