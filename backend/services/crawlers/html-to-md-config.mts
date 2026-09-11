import type { CrawlerHtmlToMarkdownOptions } from '@jongleberry/vurst-html'

export type { CrawlerHtmlToMarkdownOptions }

export function mergeConfigs(
  baseConfig: CrawlerHtmlToMarkdownOptions,
  ...configs: CrawlerHtmlToMarkdownOptions[]
): CrawlerHtmlToMarkdownOptions {
  const output: CrawlerHtmlToMarkdownOptions = { ...baseConfig }
  for (const config of configs) {
    for (const key of Object.keys(config) as Array<keyof CrawlerHtmlToMarkdownOptions>) {
      const value = config[key]
      if (value === undefined) continue

      switch (key) {
        case 'cssSelectorsToRemove':
        case 'contentSelectors':
        case 'linkTextContentToRemove':
        case 'linkHrefsToRemove':
        case 'linkRelTokensToRemove': {
          if (!Array.isArray(value)) throw new TypeError(`config.${key} must be an array`)
          const existingArray = (output[key] as string[]) || []
          output[key] = [...existingArray, ...(value as string[])] as typeof value
          break
        }
        case 'useTextDensityFilter': {
          if (typeof value !== 'boolean') throw new TypeError(`config.${key} must be a boolean`)
          output[key] = value
          break
        }
      }
    }
  }
  return output
}

export const defaultConfig: CrawlerHtmlToMarkdownOptions = {
  cssSelectorsToRemove: [
    // body content (head/title are excluded from markdown by the extractor natively;
    // do NOT list them here — they would also suppress meta_tags/title/links extraction)
    'script',
    'img',
    'style',

    // hidden elements
    '.hide',
    '.hidden',
    '[hidden]',
    '.visually-hidden',

    // Aria roles to remove
    '[role="navigation"]',
    '[role="menu"]',

    // ads
    '.ad, .ads, .advertisement, .ad-container',
    '.sponsored, .promoted, .sponsor',
    '[class*="ad-"], [id*="ad-"]',
    '[class*="ad_"], [id*="ad_"]',
    '.banner, .popup, .interstitial',

    // trackers and analytics
    '.tracking, .analytics, .cookie, .consent',
    '[id*="tracker-"], [id*="analytics-"]',
    '[id*="tracker_"], [id*="analytics_"]',

    // navigation
    '.navbar, .nav, .footer',
    '.menu, .sidebar, .breadcrumb, .pagination',
    '.tabs, .dropdown',
    'footer',
    'nav',

    // social media
    '.social, .share, .follow',
    '.like, .tweet, .pinterest',

    // interactive elements
    'button, input, form, select, textarea',
    '.button, .btn, .input, .search',
    '.form, .modal, .tooltip',
    '[class*="dropdown"], [class*="modal"]',
    '[aria-label="Close"]',
    '[aria-label="Breadcrumb"]',

    // feedback
    '.feedback',

    // asides
    'iframe',
    'aside', // aside means it is indirectly related to the main content

    // other
    '.overlay, .loading, .spinner',
    '.newsletter, .subscribe, .signup',

    // ARIA roles
    '[role="banner"]',
    '[role="complementary"]',
    '[role="contentinfo"]',
    '[role="search"]',
    '[role="alert"]',
    '[role="dialog"]',

    // Aria labels
    '[aria-label="ads"], [aria-label="advertisement"]',
    '[aria-label="social media"], [aria-label="share"]',
    '[aria-label="navigation"], [aria-label="menu"]',
    '[aria-hidden="true"]',
    '[aria-expanded="false"]',

    // Wordpress
    '#masthead',
    '#footer',
  ],

  contentSelectors: [],

  linkTextContentToRemove: ['†', '*', '**', 'Close'],

  linkHrefsToRemove: ['javascript:'],

  linkRelTokensToRemove: [],

  useTextDensityFilter: false,
}
