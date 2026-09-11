import type { Crawler } from './types.mts'
import {
  mergeConfigs,
  defaultConfig,
  type CrawlerHtmlToMarkdownOptions,
} from './html-to-md-config.mts'

export const applyCrawlerRules = (
  crawler: Crawler | null,
  baseOptions: CrawlerHtmlToMarkdownOptions = {},
): CrawlerHtmlToMarkdownOptions => {
  if (!crawler) {
    return mergeConfigs(defaultConfig, baseOptions)
  }

  const crawlerOptions: CrawlerHtmlToMarkdownOptions = {}

  if (crawler.css_selectors_to_remove.length > 0) {
    crawlerOptions.cssSelectorsToRemove = crawler.css_selectors_to_remove
  }

  if (crawler.link_text_content_to_remove.length > 0) {
    crawlerOptions.linkTextContentToRemove = crawler.link_text_content_to_remove
  }

  if (crawler.link_hrefs_to_remove.length > 0) {
    crawlerOptions.linkHrefsToRemove = crawler.link_hrefs_to_remove
  }

  if (crawler.content_selectors.length > 0) {
    crawlerOptions.contentSelectors = crawler.content_selectors
  }

  return mergeConfigs(defaultConfig, baseOptions, crawlerOptions)
}
