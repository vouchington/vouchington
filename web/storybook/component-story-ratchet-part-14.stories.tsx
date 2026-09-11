import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { componentStoryRatchetParameters } from './component-story-ratchet-parameters'
import {
  ComponentStoryRatchetGrid,
  type RatchetedComponent,
} from './component-story-ratchet-renderer'
import { AdditionalDomains as TopicsManageSourceAdditionalDomainsSectionAdditionalDomains } from '@/components/topics/manage-source/additional-domains-section'
import { CrawlHistorySection as TopicsManageSourceCrawlHistorySectionCrawlHistorySection } from '@/components/topics/manage-source/crawl-history-section'
import { DomainsSection as TopicsManageSourceDomainsSectionDomainsSection } from '@/components/topics/manage-source/domains-section'
import { FeedActionsSection as TopicsManageSourceFeedActionsSectionFeedActionsSection } from '@/components/topics/manage-source/feed-actions-section'
import { FeedMetadataSection as TopicsManageSourceFeedMetadataSectionFeedMetadataSection } from '@/components/topics/manage-source/feed-metadata-section'
import { HostnameInput as TopicsManageSourceHostnameInputHostnameInput } from '@/components/topics/manage-source/hostname-input'
import { SourceSection as TopicsManageSourceSourceSectionSourceSection } from '@/components/topics/manage-source/source-section'
import { AboutClient as TopicsSettingsAboutClientAboutClient } from '@/components/topics/settings/about-client'
import { BasicInfoSection as TopicsSettingsBasicInfoSectionBasicInfoSection } from '@/components/topics/settings/basic-info-section'
import { BehaviorClient as TopicsSettingsBehaviorClientBehaviorClient } from '@/components/topics/settings/behavior-client'
import { DomainsClient as TopicsSettingsDomainsClientDomainsClient } from '@/components/topics/settings/domains-client'
import { ImageSection as TopicsSettingsImageSectionImageSection } from '@/components/topics/settings/image-section'
import { MergeClient as TopicsSettingsMergeClientMergeClient } from '@/components/topics/settings/merge-client'
import { ReferralValidationsSettings as TopicsSettingsReferralValidationsSettingsReferralValidationsSettings } from '@/components/topics/settings/referral-validations-settings'
import { SourceClient as TopicsSettingsSourceClientSourceClient } from '@/components/topics/settings/source-client'
import { SpendingCategorySection as TopicsSettingsSpendingCategorySectionSpendingCategorySection } from '@/components/topics/settings/spending-category-section'
import { TopicFlagsSection as TopicsSettingsTopicFlagsSectionTopicFlagsSection } from '@/components/topics/settings/topic-flags-section'
import { TopicTypeSection as TopicsSettingsTopicTypeSectionTopicTypeSection } from '@/components/topics/settings/topic-type-section'
import { InternalCarouselNext as UiCarouselControlsInternalCarouselNext } from '@/components/ui/carousel/controls'

const ratchetedComponentsPart14 = [
  {
    key: 'web/components/topics/manage-source/additional-domains-section.tsx#AdditionalDomains',
    component: TopicsManageSourceAdditionalDomainsSectionAdditionalDomains,
  },
  {
    key: 'web/components/topics/manage-source/crawl-history-section.tsx#CrawlHistorySection',
    component: TopicsManageSourceCrawlHistorySectionCrawlHistorySection,
  },
  {
    key: 'web/components/topics/manage-source/domains-section.tsx#DomainsSection',
    component: TopicsManageSourceDomainsSectionDomainsSection,
  },
  {
    key: 'web/components/topics/manage-source/feed-actions-section.tsx#FeedActionsSection',
    component: TopicsManageSourceFeedActionsSectionFeedActionsSection,
  },
  {
    key: 'web/components/topics/manage-source/feed-metadata-section.tsx#FeedMetadataSection',
    component: TopicsManageSourceFeedMetadataSectionFeedMetadataSection,
  },
  {
    key: 'web/components/topics/manage-source/hostname-input.tsx#HostnameInput',
    component: TopicsManageSourceHostnameInputHostnameInput,
    props: {
      id: 'source-hostname',
      name: 'sourceHostname',
      placeholder: 'example.com',
      label: 'Source hostname',
    },
  },
  {
    key: 'web/components/topics/manage-source/source-section.tsx#SourceSection',
    component: TopicsManageSourceSourceSectionSourceSection,
  },
  {
    key: 'web/components/topics/settings/about-client.tsx#AboutClient',
    component: TopicsSettingsAboutClientAboutClient,
  },
  {
    key: 'web/components/topics/settings/basic-info-section.tsx#BasicInfoSection',
    component: TopicsSettingsBasicInfoSectionBasicInfoSection,
  },
  {
    key: 'web/components/topics/settings/behavior-client.tsx#BehaviorClient',
    component: TopicsSettingsBehaviorClientBehaviorClient,
  },
  {
    key: 'web/components/topics/settings/domains-client.tsx#DomainsClient',
    component: TopicsSettingsDomainsClientDomainsClient,
  },
  {
    key: 'web/components/topics/settings/image-section.tsx#ImageSection',
    component: TopicsSettingsImageSectionImageSection,
  },
  {
    key: 'web/components/topics/settings/merge-client.tsx#MergeClient',
    component: TopicsSettingsMergeClientMergeClient,
  },
  {
    key: 'web/components/topics/settings/referral-validations-settings.tsx#ReferralValidationsSettings',
    component: TopicsSettingsReferralValidationsSettingsReferralValidationsSettings,
  },
  {
    key: 'web/components/topics/settings/source-client.tsx#SourceClient',
    component: TopicsSettingsSourceClientSourceClient,
  },
  {
    key: 'web/components/topics/settings/spending-category-section.tsx#SpendingCategorySection',
    component: TopicsSettingsSpendingCategorySectionSpendingCategorySection,
  },
  {
    key: 'web/components/topics/settings/topic-flags-section.tsx#TopicFlagsSection',
    component: TopicsSettingsTopicFlagsSectionTopicFlagsSection,
  },
  {
    key: 'web/components/topics/settings/topic-type-section.tsx#TopicTypeSection',
    component: TopicsSettingsTopicTypeSectionTopicTypeSection,
  },
  {
    key: 'web/components/ui/carousel/controls.tsx#InternalCarouselNext',
    component: UiCarouselControlsInternalCarouselNext,
  },
] satisfies RatchetedComponent[]

const meta = {
  title: 'Coverage/Component Story Ratchet Part 14',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const CoveragePart14: Story = {
  parameters: componentStoryRatchetParameters,
  render: () => (
    <ComponentStoryRatchetGrid
      title='Component Story Ratchet Part 14'
      components={ratchetedComponentsPart14}
    />
  ),
}
