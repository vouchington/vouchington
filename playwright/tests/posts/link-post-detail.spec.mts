import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import {
  insertTestLinkPostWithCrawl,
  insertTestLinkPostBare,
  insertTestLinkPostWithVideoUrl,
} from '../../../backend/test-helpers/entities/link-posts.mts'
import {
  insertTestLinkPostWithAudio,
  insertTestLinkPostWithPodcastEpisode,
} from '../../../backend/test-helpers/entities/rss-feed-link-posts.mts'

const TEST_USER_ID = '019f0000-0000-7000-8000-000000000000'

test('link post with article embed shows article embed', async ({ page }) => {
  const { slug } = await insertTestLinkPostWithCrawl({
    createdById: TEST_USER_ID,
    crawlTitle: 'Test Article Link Post',
  })
  await navigateTo(page, `/link/${slug}`)
  await expect(page.getByTestId('link-post-article-embed-detail')).toBeVisible()
})

test('link post with audio embed shows audio embed', async ({ page }) => {
  const { slug } = await insertTestLinkPostWithAudio({
    createdById: TEST_USER_ID,
  })
  await navigateTo(page, `/link/${slug}`)
  await expect(page.getByTestId('link-post-audio-embed')).toBeVisible()
})

test('link post with no crawl data shows bare source URL link', async ({ page }) => {
  const { slug } = await insertTestLinkPostBare({
    createdById: TEST_USER_ID,
  })
  await navigateTo(page, `/link/${slug}`)
  await expect(page.getByTestId('link-post-source-url')).toBeVisible()
})

test('link post with YouTube URL shows video embed', async ({ page }) => {
  const { slug } = await insertTestLinkPostWithVideoUrl({
    createdById: TEST_USER_ID,
  })
  await navigateTo(page, `/link/${slug}`)
  await expect(page.getByTestId('link-post-video-embed')).toBeVisible()
})

test('link post with podcast episode shows podcast embed', async ({ page }) => {
  const { slug } = await insertTestLinkPostWithPodcastEpisode({
    createdById: TEST_USER_ID,
  })
  await navigateTo(page, `/link/${slug}`)
  await expect(page.getByTestId('link-post-podcast-embed')).toBeVisible()
})
