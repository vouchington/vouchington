import { describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { dynamicConfigRegistry } from './registry.mts'
import * as owner0 from '@services/notifications/work-limits'
import * as owner1 from '@services/bookmarks/work-limits'
import * as owner2 from '@services/urls-domains-blacklist/work-limits'
import * as owner3 from '@services/classifier-runs/work-limits'
import * as owner4 from '@services/classifiers/work-limits'
import * as owner5 from '@services/elections-votes/work-limits'
import * as owner6 from '@services/entity-relations/work-limits'
import * as owner7 from '@services/media-delivery-safety/work-limits'
import * as owner8 from '@services/posts/work-limits'
import * as owner9 from '@services/remote-actors/work-limits'
import * as owner10 from '@services/stories/work-limits'
import * as owner11 from '@services/topics/work-limits'
import * as owner12 from '@services/user-deletions/work-limits'
import * as owner13 from '@services/ap-inbox-activities/work-limits'
import * as owner14 from '@services/engagement-emails/work-limits'
import * as owner15 from '@services/recommended-topics/work-limits'
import * as owner16 from '@services/stripe/work-limits'
import * as owner17 from '@queues/find-your-friends/config'
import * as owner18 from '@queues/crawl-boilerplate-removal/config'

const owners = [
  {
    config: owner0.notificationsWorkConfig,
    maxima: owner0.notificationsWorkMaxValues,
    read: (field: string) =>
      owner0.getNotificationsWorkLimit(field as keyof typeof owner0.notificationsWorkMaxValues),
  },
  {
    config: owner1.bookmarksWorkConfig,
    maxima: owner1.bookmarksWorkMaxValues,
    read: (field: string) =>
      owner1.getBookmarksWorkLimit(field as keyof typeof owner1.bookmarksWorkMaxValues),
  },
  {
    config: owner2.urlsDomainsBlacklistWorkConfig,
    maxima: owner2.urlsDomainsBlacklistWorkMaxValues,
    read: (field: string) =>
      owner2.getUrlsDomainsBlacklistWorkLimit(
        field as keyof typeof owner2.urlsDomainsBlacklistWorkMaxValues,
      ),
  },
  {
    config: owner3.classifierRunsWorkConfig,
    maxima: owner3.classifierRunsWorkMaxValues,
    read: (field: string) =>
      owner3.getClassifierRunsWorkLimit(field as keyof typeof owner3.classifierRunsWorkMaxValues),
  },
  {
    config: owner4.classifiersWorkConfig,
    maxima: owner4.classifiersWorkMaxValues,
    read: (field: string) =>
      owner4.getClassifiersWorkLimit(field as keyof typeof owner4.classifiersWorkMaxValues),
  },
  {
    config: owner5.electionsVotesWorkConfig,
    maxima: owner5.electionsVotesWorkMaxValues,
    read: (field: string) =>
      owner5.getElectionsVotesWorkLimit(field as keyof typeof owner5.electionsVotesWorkMaxValues),
  },
  {
    config: owner6.entityRelationsWorkConfig,
    maxima: owner6.entityRelationsWorkMaxValues,
    read: (field: string) =>
      owner6.getEntityRelationsWorkLimit(field as keyof typeof owner6.entityRelationsWorkMaxValues),
  },
  {
    config: owner7.mediaDeliverySafetyWorkConfig,
    maxima: owner7.mediaDeliverySafetyWorkMaxValues,
    read: (field: string) =>
      owner7.getMediaDeliverySafetyWorkLimit(
        field as keyof typeof owner7.mediaDeliverySafetyWorkMaxValues,
      ),
  },
  {
    config: owner8.postsWorkConfig,
    maxima: owner8.postsWorkMaxValues,
    read: (field: string) =>
      owner8.getPostsWorkLimit(field as keyof typeof owner8.postsWorkMaxValues),
  },
  {
    config: owner9.remoteActorsWorkConfig,
    maxima: owner9.remoteActorsWorkMaxValues,
    read: (field: string) =>
      owner9.getRemoteActorsWorkLimit(field as keyof typeof owner9.remoteActorsWorkMaxValues),
  },
  {
    config: owner10.storiesWorkConfig,
    maxima: owner10.storiesWorkMaxValues,
    read: (field: string) =>
      owner10.getStoriesWorkLimit(field as keyof typeof owner10.storiesWorkMaxValues),
  },
  {
    config: owner11.topicsWorkConfig,
    maxima: owner11.topicsWorkMaxValues,
    read: (field: string) =>
      owner11.getTopicsWorkLimit(field as keyof typeof owner11.topicsWorkMaxValues),
  },
  {
    config: owner12.userDeletionsWorkConfig,
    maxima: owner12.userDeletionsWorkMaxValues,
    read: (field: string) =>
      owner12.getUserDeletionsWorkLimit(field as keyof typeof owner12.userDeletionsWorkMaxValues),
  },
  {
    config: owner13.apInboxActivitiesWorkConfig,
    maxima: owner13.apInboxActivitiesWorkMaxValues,
    read: (field: string) =>
      owner13.getApInboxActivitiesWorkLimit(
        field as keyof typeof owner13.apInboxActivitiesWorkMaxValues,
      ),
  },
  {
    config: owner14.engagementEmailsWorkConfig,
    maxima: owner14.engagementEmailsWorkMaxValues,
    read: (field: string) =>
      owner14.getEngagementEmailsWorkLimit(
        field as keyof typeof owner14.engagementEmailsWorkMaxValues,
      ),
  },
  {
    config: owner15.recommendedTopicsWorkConfig,
    maxima: owner15.recommendedTopicsWorkMaxValues,
    read: (field: string) =>
      owner15.getRecommendedTopicsWorkLimit(
        field as keyof typeof owner15.recommendedTopicsWorkMaxValues,
      ),
  },
  {
    config: owner16.stripeWorkConfig,
    maxima: owner16.stripeWorkMaxValues,
    read: (field: string) =>
      owner16.getStripeWorkLimit(field as keyof typeof owner16.stripeWorkMaxValues),
  },
  {
    config: owner17.findYourFriendsWorkConfig,
    maxima: owner17.findYourFriendsWorkMaxValues,
    read: (field: string) =>
      owner17.getFindYourFriendsWorkLimit(
        field as keyof typeof owner17.findYourFriendsWorkMaxValues,
      ),
  },
  {
    config: owner18.crawlBoilerplateRemovalWorkConfig,
    maxima: owner18.crawlBoilerplateRemovalWorkMaxValues,
    read: (field: string) =>
      owner18.getCrawlBoilerplateRemovalWorkLimit(
        field as keyof typeof owner18.crawlBoilerplateRemovalWorkMaxValues,
      ),
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
