import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { insertTestRssFeed } from '../../helpers/insert-test-rss-feed.mts'
import { write } from '../../../backend/data-stores/psql/clients.mts'
import { insertTestRssFeedItem } from '../../../backend/test-helpers/entities/rss-feed-items.mts'
import { updateUserFields } from '../../../backend/services/users/update-fields.mts'

test.describe('Hacker News discussions aside', () => {
  test.use({ storageState: AUTH_STATE })
  let rssItemId: string
  let feedId: string
  let topicId: string
  let articleUrl: string

  test.beforeEach(async () => {
    const suffix = `hn-aside-${randomSuffix()}`
    const topic = await insertTestTopic(`HN Aside Topic ${suffix}`, `hn-aside-${suffix}`)
    topicId = topic.id
    const feed = await insertTestRssFeed(topicId, suffix)
    feedId = feed.id
    const { hostname, hostnameId } = feed
    articleUrl = `https://${hostname}/hn-aside-${suffix}`
    const urlResult = await write(
      `/* hn-discussions-aside.spec insert article url */
       INSERT INTO urls (url, hostname_id, pathname, search_params)
       VALUES ($1, $2, $3, '{}'::JSONB)
       ON CONFLICT (url) DO UPDATE SET hostname_id = EXCLUDED.hostname_id
       RETURNING id`,
      [articleUrl, hostnameId, `/hn-aside-${suffix}`],
    )
    const urlId = urlResult.rows[0].id as string
    rssItemId = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId,
      guid: `hn-aside-${suffix}`,
      itemData: {
        title: 'HN aside article',
        link: articleUrl,
        guid: `hn-aside-${suffix}`,
        isoDate: '2026-01-15T00:00:00.000Z',
        contentSnippet: 'Article used to cover HN aside Playwright selectors.',
      },
      contentSha256: Buffer.from('02'.padStart(64, '0'), 'hex'),
    })
  })

  test.afterEach(async () => {
    const errors: unknown[] = []
    try {
      await write(`DELETE FROM rss_feeds WHERE id = $1`, [feedId])
    } catch (error) {
      errors.push(error)
    }
    try {
      await write(`DELETE FROM rss_feed_item_ids WHERE id = $1`, [rssItemId])
    } catch (error) {
      errors.push(error)
    }
    try {
      await write(`DELETE FROM topics WHERE id = $1`, [topicId])
    } catch (error) {
      errors.push(error)
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'hn-discussions-aside cleanup failed')
    }
  })

  test('shows related HN threads for an RSS item URL', async ({ page }) => {
    const user = await withCleanUser(page)
    await updateUserFields(user.id, { hn_discussions: true })
    await page.route('https://hn.algolia.com/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          hits: [
            {
              objectID: '4242',
              title: 'Fixture HN thread',
              url: articleUrl,
              points: 17,
              num_comments: 5,
            },
          ],
        }),
      })
    })

    await navigateTo(page, `/news?rss_item=${rssItemId}`)

    const aside = page.getByTestId('hn-discussions-aside')
    await expect(aside).toBeVisible()
    const thread = aside.getByTestId('hn-discussions-thread')
    await expect(thread).toHaveCount(1)
    await expect(thread.getByTestId('hn-discussions-title')).toHaveText('Fixture HN thread')
    await expect(thread.getByTestId('hn-discussions-score')).toContainText('17')
    await expect(thread.getByTestId('hn-discussions-comments')).toContainText('5')
  })
})
