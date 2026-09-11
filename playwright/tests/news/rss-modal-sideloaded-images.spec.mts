// Real-network test: the sideload pipeline fetches picsum.photos/seed/voucha-pw/640/360 through
// the image-resize Lambda. picsum.photos/seed/<fixed> is deterministic so bytes are stable across
// runs. CI has S3 credentials; skip locally when neither S3_AWS_ACCESS_KEY_ID nor
// AWS_ACCESS_KEY_ID is set (the Lambda needs S3 to cache the resized image before returning it).
import { test, expect, type Request } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import {
  installImageResponseGuard,
  expectAllImagesLoaded,
} from '../../helpers/expect-no-broken-images.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { insertTestRssFeed } from '../../helpers/insert-test-rss-feed.mts'
import { write } from '../../../backend/data-stores/psql/clients.mts'
import { insertTestRssFeedItem } from '../../../backend/test-helpers/entities/rss-feed-items.mts'
import {
  parseSigningKeys,
  SIDELOAD_SIGNING_KEYS_ENV,
  signPath,
} from '../../../ts-shared/url-signing/index.mts'

// The image-resize Lambda needs S3 (to cache resized output) AND outbound HTTPS to
// picsum.photos. Both are reliable in CI; locally either can be flaky depending on the
// dev's AWS profile and network. Skip outside CI so local cheap checks stay offline
// on environment-specific failures while still exercising the path on every CI run.
const hasS3Credentials = Boolean(process.env.S3_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID)
const isCI = Boolean(process.env.CI)

test.describe('sideloaded images in RSS item modal', () => {
  let rssItemId: string
  // Track resources for per-test cleanup so we never leave rss_feeds rows pointing at
  // throwaway topics — orphaned rows would block future seeds (rss_feeds.topic_id has
  // ON DELETE RESTRICT, so the seed's DELETE FROM topics would fail).
  let feedId: string | undefined
  let topicId: string | undefined

  test.beforeEach(async () => {
    // Skip before any DB writes — when running locally without S3/CI, this avoids
    // churning topics/feeds/items just to discard them in afterEach.
    test.skip(!isCI, 'Sideload + image-resize stack is only reliably available in CI')
    test.skip(!hasS3Credentials, 'Requires S3 credentials for the image-resize Lambda cache')

    const suffix = `sideload-${randomSuffix()}`

    // Fresh throwaway topic — does NOT reuse a seeded topic, so the test stays orthogonal
    // to playwright-test-data seeds. The modal route (/news?rss_item=<id>) calls
    // getRssFeedItemById which doesn't filter by user follows, so the user doesn't need
    // to follow this topic.
    const topic = await insertTestTopic(`Sideload Test Topic ${suffix}`, `sideload-test-${suffix}`)
    topicId = topic.id

    const feed = await insertTestRssFeed(topicId, suffix)
    feedId = feed.id
    const { hostname, hostnameId } = feed

    const articleUrl = `https://${hostname}/test-sideload-${suffix}`
    const urlResult = await write(
      `/* rss-modal-sideloaded-images.spec insert article url */
       INSERT INTO urls (url, hostname_id, pathname, search_params)
       VALUES ($1, $2, $3, '{}'::JSONB)
       ON CONFLICT (url) DO UPDATE SET hostname_id = EXCLUDED.hostname_id
       RETURNING id`,
      [articleUrl, hostnameId, `/test-sideload-${suffix}`],
    )
    const urlId = urlResult.rows[0].id as string

    // Insert the RSS item whose description contains an external image.
    // The backend sanitizer rewrites the src to an absolute image-origin
    // /sideload/<base64url>?sig=<hmac> URL at API response time.
    rssItemId = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId,
      guid: `sideload-test-${suffix}`,
      itemData: {
        title: 'Test Article with Sideloaded Image',
        link: articleUrl,
        guid: `sideload-test-${suffix}`,
        isoDate: '2025-01-15T00:00:00.000Z',
        contentSnippet: 'Test article with a sideloaded image.',
        description:
          '<p>Test body.</p>' +
          '<img src="https://picsum.photos/seed/voucha-pw/640/360" alt="test sideloaded image" />',
      },
      contentSha256: Buffer.from('01'.padStart(64, '0'), 'hex'),
    })
  })

  test.afterEach(async () => {
    // Tear down so the throwaway topic can be deleted (rss_feeds.topic_id is ON DELETE
    // RESTRICT). rss_feed_item_sources and the enablement/discoverability tables CASCADE
    // off rss_feeds, so deleting the feed cleans those up automatically; rss_feed_items
    // is independent and must be deleted explicitly. Each delete is independent so a
    // failure in one step (e.g. transient DB error) does not leave the remainder orphaned
    // and blocking future seed runs.
    const errors: unknown[] = []
    if (feedId) {
      try {
        await write(`DELETE FROM rss_feeds WHERE id = $1`, [feedId])
      } catch (error) {
        errors.push(error)
      }
    }
    if (rssItemId) {
      try {
        await write(`DELETE FROM rss_feed_item_ids WHERE id = $1`, [rssItemId])
      } catch (error) {
        errors.push(error)
      }
    }
    if (topicId) {
      try {
        await write(`DELETE FROM topics WHERE id = $1`, [topicId])
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'rss-modal-sideloaded-images cleanup failed')
    }
  })

  test('sideloaded images in RSS modal body load successfully', async ({ page }) => {
    const guard = installImageResponseGuard(page)
    const imageRequests: Request[] = []
    page.on('request', request => {
      if (request.resourceType() === 'image') imageRequests.push(request)
    })

    await navigateTo(page, `/news?rss_item=${rssItemId}`)

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // DOM gate: every <img> under the dialog must resolve with non-zero naturalWidth.
    await expectAllImagesLoaded(dialog)

    const sideloadImage = dialog.locator('img[src*="/sideload/"]')
    await expect(sideloadImage).toHaveCount(1)
    const sideloadSrcValue = await sideloadImage.getAttribute('src')
    expect(sideloadSrcValue).not.toBeNull()
    const sideloadSrc = new URL(sideloadSrcValue!)
    expect(process.env.IMAGE_ORIGIN).toBeTruthy()
    expect(sideloadSrc.origin).toBe(new URL(process.env.IMAGE_ORIGIN!).origin)
    expect(sideloadSrc.pathname).toMatch(/^\/sideload\//)
    expect(sideloadSrc.searchParams.get('w')).toBeTruthy()
    const signingKeys = parseSigningKeys(process.env[SIDELOAD_SIGNING_KEYS_ENV])
    expect(sideloadSrc.searchParams.has('sig')).toBe(
      signPath(sideloadSrc.pathname, signingKeys) !== '',
    )
    expect(imageRequests.some(request => new URL(request.url()).pathname === '/_next/image')).toBe(
      false,
    )
    const sideloadRequest = imageRequests.find(request => {
      const url = new URL(request.url())
      return url.origin === sideloadSrc.origin && url.pathname === sideloadSrc.pathname
    })
    expect(sideloadRequest).toBeDefined()
    expect(sideloadRequest!.headers()['accept']).toMatch(/image\/(?:avif|webp|\*)/)

    // Network gate: no image request during this test returned a non-2xx status.
    guard.assertNoImageFailures()
  })
})
