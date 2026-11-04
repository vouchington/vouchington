import { allowUnannotatedQuery } from '../../../backend/data-stores/psql/prepared-statement-name.mts'
import { write } from '../../../backend/data-stores/psql/clients.mts'
import { insertHackerNewsReferencesForTest } from '../../../backend/test-helpers/hacker-news-references.mts'
import { insertTestRssFeedItem } from '../../../backend/test-helpers/entities/rss-feed-items.mts'
import { navigateTo, randomSuffix } from 'vouchington-tooling/playwright'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { insertTestRssFeed } from '../../helpers/insert-test-rss-feed.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { expect, test } from '../../helpers/test.mts'

test.describe('Hacker News references', () => {
  test.use({ storageState: AUTH_STATE })
  let rssItemId: string
  let feedId: string
  let topicId: string

  test.beforeEach(async () => {
    const suffix = `hn-refs-${randomSuffix()}`
    const topic = await insertTestTopic(`HN Refs Topic ${suffix}`, `hn-refs-${suffix}`)
    topicId = topic.id
    const feed = await insertTestRssFeed(topicId, suffix)
    feedId = feed.id
    const articleUrl = `https://${feed.hostname}/hn-refs-${suffix}`
    const urlResult = await write(
      `/* hacker-news-references.spec insert article url */
       INSERT INTO urls (url, hostname_id, pathname, search_params)
       VALUES ($1, $2, $3, '{}'::JSONB)
       ON CONFLICT (url) DO UPDATE SET hostname_id = EXCLUDED.hostname_id
       RETURNING id`,
      [articleUrl, feed.hostnameId, `/hn-refs-${suffix}`],
    )
    const urlId = urlResult.rows[0].id as string
    rssItemId = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId,
      guid: `hn-refs-${suffix}`,
      itemData: {
        title: 'HN references article',
        link: articleUrl,
        guid: `hn-refs-${suffix}`,
        isoDate: '2026-01-15T00:00:00.000Z',
        contentSnippet: 'Article used to cover Hacker News reference Playwright selectors.',
      },
      contentSha256: Buffer.from('03'.padStart(64, '0'), 'hex'),
    })
    await insertHackerNewsReferencesForTest({
      url_id: urlId,
      story_count: 1,
      comment_count: 2,
      stories: [
        {
          hacker_news_item_id: 4242,
          points: 17,
          reply_count: 5,
          posted_at: '2026-01-16T00:00:00.000Z',
        },
      ],
      comments: [
        {
          hacker_news_item_id: 4343,
          parent_story_item_id: 4242,
          posted_at: '2026-01-17T00:00:00.000Z',
        },
      ],
    })
  })

  test.afterEach(async () => {
    const errors: unknown[] = []
    for (const [statement, id] of [
      ['DELETE FROM rss_feeds WHERE id = $1', feedId],
      ['DELETE FROM rss_feed_item_guids WHERE id = $1', rssItemId],
      ['DELETE FROM topics WHERE id = $1', topicId],
    ] as const) {
      try {
        await write(allowUnannotatedQuery(statement), [id])
      } catch (err) {
        errors.push(err)
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'hacker-news-references cleanup failed')
    }
  })

  test('links the stored threads in the RSS item modal', async ({ page }) => {
    await navigateTo(page, `/news?rss_item=${rssItemId}`)

    const aside = page.getByTestId('hacker-news-references-aside')
    await expect(aside).toBeVisible()
    await expect(aside.getByTestId('hacker-news-item-link').first()).toHaveAttribute(
      'href',
      'https://news.ycombinator.com/item?id=4242',
    )
  })

  test('labels list cards and keeps the filter on', async ({ page }) => {
    await navigateTo(page, '/news?hacker_news=1')

    await expect(page.getByTestId('hacker-news-filter')).toBeChecked()
    const label = page.getByTestId('hacker-news-reference-label').first()
    await expect(label).toBeVisible()
    await expect(label.getByTestId('hacker-news-story-count')).toBeVisible()
    await expect(label.getByTestId('hacker-news-comment-count')).toBeVisible()
  })
})

test('bounds the post time range when filtering Hacker News references', async ({ page }) => {
  await navigateTo(page, '/posts?time_range=all&after=old&q=example')
  await page.getByTestId('hacker-news-filter').click()
  await expect(page).toHaveURL(/hacker_news=1/)
  await expect(page.getByTestId('hacker-news-filter')).toBeChecked()
  await expect(page).toHaveURL(/time_range=1y/)
  await expect(page).not.toHaveURL(/after=/)
  await expect(page).toHaveURL(/q=example/)

  await page.getByTestId('post-time-range-trigger').click()
  await expect(page.getByTestId('post-time-range-option-all')).toHaveCount(0)
  await page.getByTestId('post-time-range-option-1m').click()
  await expect(page).toHaveURL(/time_range=1m/)

  await page.getByTestId('hacker-news-filter').click()
  await expect(page).not.toHaveURL(/hacker_news=1/)
  await expect(page.getByTestId('hacker-news-filter')).not.toBeChecked()
  await page.getByTestId('post-time-range-trigger').click()
  await expect(page.getByTestId('post-time-range-option-all')).toBeVisible()
})
