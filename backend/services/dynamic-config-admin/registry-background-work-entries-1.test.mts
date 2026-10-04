import { describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { dynamicConfigRegistry } from './registry.mts'
import * as owner0 from '@services/ai-usage/work-limits'
import * as owner1 from '@services/bluesky-follows/work-limits'
import * as owner2 from '@services/crawl-embeds/work-limits'
import * as owner3 from '@services/language-detection/work-limits'
import * as owner4 from '@services/report-integrity/work-limits'
import * as owner5 from '@services/images/work-limits'
import * as owner6 from '@services/openai-background-responses/work-limits'
import * as owner7 from '@services/openai-moderation/work-limits'
import * as owner8 from '@services/entity-cache/work-limits'
import * as owner9 from '@services/hostname-blocking/work-limits'
import * as owner10 from '@services/moderation-reports/work-limits'
import * as owner11 from '@services/communities/work-limits'
import * as owner12 from '@queues/admin-imports/config'
import * as owner13 from '@services/follower-distributions/work-limits'
import * as owner14 from '@services/oauth-facebook/work-limits'
import * as owner15 from '@services/oauth-github/work-limits'
import * as owner16 from '@services/oauth-x/work-limits'
import * as owner17 from '@services/post-publication/work-limits'
import * as owner18 from '@services/rss-feed-items/work-limits'
import * as owner19 from '@services/rss-feeds/work-limits'

const owners = [
  {
    config: owner0.aiUsageWorkConfig,
    maxima: owner0.aiUsageWorkMaxValues,
    read: (field: string) =>
      owner0.getAiUsageWorkLimit(field as keyof typeof owner0.aiUsageWorkMaxValues),
  },
  {
    config: owner1.blueskyFollowsWorkConfig,
    maxima: owner1.blueskyFollowsWorkMaxValues,
    read: (field: string) =>
      owner1.getBlueskyFollowsWorkLimit(field as keyof typeof owner1.blueskyFollowsWorkMaxValues),
  },
  {
    config: owner2.crawlEmbedsWorkConfig,
    maxima: owner2.crawlEmbedsWorkMaxValues,
    read: (field: string) =>
      owner2.getCrawlEmbedsWorkLimit(field as keyof typeof owner2.crawlEmbedsWorkMaxValues),
  },
  {
    config: owner3.languageDetectionWorkConfig,
    maxima: owner3.languageDetectionWorkMaxValues,
    read: (field: string) =>
      owner3.getLanguageDetectionWorkLimit(
        field as keyof typeof owner3.languageDetectionWorkMaxValues,
      ),
  },
  {
    config: owner4.reportIntegrityWorkConfig,
    maxima: owner4.reportIntegrityWorkMaxValues,
    read: (field: string) =>
      owner4.getReportIntegrityWorkLimit(field as keyof typeof owner4.reportIntegrityWorkMaxValues),
  },
  {
    config: owner5.imagesWorkConfig,
    maxima: owner5.imagesWorkMaxValues,
    read: (field: string) =>
      owner5.getImagesWorkLimit(field as keyof typeof owner5.imagesWorkMaxValues),
  },
  {
    config: owner6.openaiBackgroundResponsesWorkConfig,
    maxima: owner6.openaiBackgroundResponsesWorkMaxValues,
    read: (field: string) =>
      owner6.getOpenaiBackgroundResponsesWorkLimit(
        field as keyof typeof owner6.openaiBackgroundResponsesWorkMaxValues,
      ),
  },
  {
    config: owner7.openaiModerationWorkConfig,
    maxima: owner7.openaiModerationWorkMaxValues,
    read: (field: string) =>
      owner7.getOpenaiModerationWorkLimit(
        field as keyof typeof owner7.openaiModerationWorkMaxValues,
      ),
  },
  {
    config: owner8.entityCacheWorkConfig,
    maxima: owner8.entityCacheWorkMaxValues,
    read: (field: string) =>
      owner8.getEntityCacheWorkLimit(field as keyof typeof owner8.entityCacheWorkMaxValues),
  },
  {
    config: owner9.hostnameBlockingWorkConfig,
    maxima: owner9.hostnameBlockingWorkMaxValues,
    read: (field: string) =>
      owner9.getHostnameBlockingWorkLimit(
        field as keyof typeof owner9.hostnameBlockingWorkMaxValues,
      ),
  },
  {
    config: owner10.moderationReportsWorkConfig,
    maxima: owner10.moderationReportsWorkMaxValues,
    read: (field: string) =>
      owner10.getModerationReportsWorkLimit(
        field as keyof typeof owner10.moderationReportsWorkMaxValues,
      ),
  },
  {
    config: owner11.communitiesWorkConfig,
    maxima: owner11.communitiesWorkMaxValues,
    read: (field: string) =>
      owner11.getCommunitiesWorkLimit(field as keyof typeof owner11.communitiesWorkMaxValues),
  },
  {
    config: owner12.adminImportsWorkConfig,
    maxima: owner12.adminImportsWorkMaxValues,
    read: (field: string) =>
      owner12.getAdminImportsWorkLimit(field as keyof typeof owner12.adminImportsWorkMaxValues),
  },
  {
    config: owner13.followerDistributionsWorkConfig,
    maxima: owner13.followerDistributionsWorkMaxValues,
    read: (field: string) =>
      owner13.getFollowerDistributionsWorkLimit(
        field as keyof typeof owner13.followerDistributionsWorkMaxValues,
      ),
  },
  {
    config: owner14.oauthFacebookWorkConfig,
    maxima: owner14.oauthFacebookWorkMaxValues,
    read: (field: string) =>
      owner14.getOauthFacebookWorkLimit(field as keyof typeof owner14.oauthFacebookWorkMaxValues),
  },
  {
    config: owner15.oauthGithubWorkConfig,
    maxima: owner15.oauthGithubWorkMaxValues,
    read: (field: string) =>
      owner15.getOauthGithubWorkLimit(field as keyof typeof owner15.oauthGithubWorkMaxValues),
  },
  {
    config: owner16.oauthXWorkConfig,
    maxima: owner16.oauthXWorkMaxValues,
    read: (field: string) =>
      owner16.getOauthXWorkLimit(field as keyof typeof owner16.oauthXWorkMaxValues),
  },
  {
    config: owner17.postPublicationWorkConfig,
    maxima: owner17.postPublicationWorkMaxValues,
    read: (field: string) =>
      owner17.getPostPublicationWorkLimit(
        field as keyof typeof owner17.postPublicationWorkMaxValues,
      ),
  },
  {
    config: owner18.rssFeedItemsWorkConfig,
    maxima: owner18.rssFeedItemsWorkMaxValues,
    read: (field: string) =>
      owner18.getRssFeedItemsWorkLimit(field as keyof typeof owner18.rssFeedItemsWorkMaxValues),
  },
  {
    config: owner19.rssFeedsWorkConfig,
    maxima: owner19.rssFeedsWorkMaxValues,
    read: (field: string) =>
      owner19.getRssFeedsWorkLimit(field as keyof typeof owner19.rssFeedsWorkMaxValues),
  },
]

describe('registered background work limits', () => {
  it('matches owner fields/defaults/ceilings and reads updates after module import', () => {
    for (const owner of owners) {
      const namespace = owner.config.key.slice('dynamic-config:'.length)
      const entry = dynamicConfigRegistry.find(candidate => candidate.namespace === namespace)!
      expect(entry).toBeDefined()
      expect(entry.config).toBe(owner.config)
      expect(Object.keys(entry.fields).toSorted()).toEqual(Object.keys(owner.maxima).toSorted())
      for (const [field, defaultValue] of Object.entries(owner.config.defaultFields)) {
        const maximum = (owner.maxima as Record<string, number>)[field]!
        expect(defaultValue).toBeLessThanOrEqual(maximum)
        expect(entry.fields[field]).toMatchObject({
          min_value: 1,
          integer: true,
          max_value: maximum,
        })
        const restore = overrideDynamicConfigFieldsForTest(owner.config, { [field]: 1 })
        try {
          expect(owner.read(field)).toBe(1)
          overrideDynamicConfigFieldsForTest(owner.config, { [field]: maximum })
          expect(owner.read(field)).toBe(maximum)
          overrideDynamicConfigFieldsForTest(owner.config, { [field]: maximum + 1 })
          expect(owner.read(field)).toBe(defaultValue)
          overrideDynamicConfigFieldsForTest(owner.config, { [field]: 0 })
          expect(owner.read(field)).toBe(defaultValue)
        } finally {
          restore()
        }
      }
    }
  })
})
