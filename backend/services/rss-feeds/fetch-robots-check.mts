import { isUrlCrawlable } from '@services/urls-domains-robots'
import { resolveIgnoreRobotsTxt } from './robots-exemption.mts'
import { isRobotsTxtIgnoredForFeeds } from './crawl-config.mts'
import { CRAWLER_USER_AGENT } from '@voucha/config'
import onError from '@modules/on-error'
import type { RssFeedToFetch } from './get-to-fetch.mts'

export function checkRssFeedCrawlable(
  feedUrl: string,
  rssFeed: Pick<RssFeedToFetch, 'feed_ignore_robots_txt' | 'hostname_ignore_robots_txt'>,
): Promise<boolean> {
  const ignoreRobots = resolveIgnoreRobotsTxt(
    rssFeed.feed_ignore_robots_txt,
    rssFeed.hostname_ignore_robots_txt,
    isRobotsTxtIgnoredForFeeds(),
  )
  return isUrlCrawlable(feedUrl, CRAWLER_USER_AGENT, {
    ignoreRobotsRules: ignoreRobots,
  }).catch(err => {
    onError(err)
    return false
  })
}
