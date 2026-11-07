import { cleanupHackerNewsReferences } from '../services/data-retention/cleanup-hacker-news.mts'
import { write } from '@data-stores/psql'

export async function corruptRssHackerNewsFlagForTest(id: string): Promise<void> {
  await write(
    `/* corruptRssHackerNewsFlagForTest */ UPDATE rss_feed_items SET has_hacker_news_references = FALSE WHERE id = $1`,
    [id],
  )
}

/** Age an owned URL so it is eligible for retention. */
export async function ageHackerNewsUrlForTest(urlId: string): Promise<void> {
  await write(
    `/* expireHackerNewsUrlForTest */ UPDATE url_hacker_news_totals SET looked_up_at = '2000-01-01' WHERE url_id = $1`,
    [urlId],
  )
}

/** Leave an excluded fixture in the normal retention window after a test. */
export async function restoreHackerNewsUrlAgeForTest(urlId: string): Promise<void> {
  await write(
    `/* restoreHackerNewsUrlAgeForTest */ UPDATE url_hacker_news_totals SET looked_up_at = CURRENT_TIMESTAMP WHERE url_id = $1`,
    [urlId],
  )
}

/** Sweep only this owned URL through the production retention processor. */
export async function expireHackerNewsUrlForTest(urlId: string): Promise<void> {
  await ageHackerNewsUrlForTest(urlId)
  await cleanupHackerNewsReferences({ urlIds: [urlId] })
}
